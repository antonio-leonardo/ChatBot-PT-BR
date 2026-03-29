/**
 * FuzzyEngine — Motor de Inferência Fuzzy Genérico e Reutilizável
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Port genérico do algoritmo FuzzyLogicApi de Antonio Leonardo
 * https://github.com/antonio-leonardo/FuzzyLogicApi
 *
 * Desacoplado de qualquer domínio. Funciona para:
 *   - Classificação de dialetos regionais (chatbot)
 *   - Inferência de tipos de juntas para pipelines industriais
 *   - Avaliação de perfis (honestidade, risco, etc.)
 *   - Qualquer domínio descrito por grupos de condições AND/OR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ═══ CONCEITOS ════════════════════════════════════════════════════════════════
 *
 *  rulesConfig — objeto que define entidades e seus grupos de regras:
 *    {
 *      entityKey: {
 *        name: string,
 *        ruleGroups: Array< Array< Condition > >
 *      }
 *    }
 *
 *  Condition — uma condição individual dentro de um grupo AND:
 *    string    → verifica se o input (texto) contém o termo
 *                ex: 'oxe', 'tchê', 'mermão'
 *    Function  → (input) => boolean, para inputs estruturados (objetos)
 *                ex: e => e.pressure > 150
 *                ex: e => e.jointType === 'flanged'
 *
 *  ruleGroups — array de grupos:
 *    Dentro de cada grupo, condições são ligadas por AND.
 *    Grupos distintos são alternativas (OR implícito).
 *    O motor seleciona o grupo de menor erro (argmin ErrorsQuantity).
 *
 * ═══ ALGORITMO (espelha FuzzyLogicCore.cs) ════════════════════════════════════
 *
 *  Para cada entidade do rulesConfig:
 *    1. Avaliar TODOS os grupos contra o input
 *    2. Selecionar argmin(errors)  → GetBruteInferenceCollection
 *       Desempate: prefere o grupo com mais condições (mais específico)
 *    3. InferenceResult = satisfeitas / total_no_melhor_grupo  → InferenceInternal
 *
 *  Saída por entidade (espelho de Inference<TEntity>):
 *    inferenceResult  : float [0.00, 1.00]
 *    conditionsNotMet : condições que falharam (= PropertiesNeedToChange)
 *    errorsQuantity   : total de falhas         (= ErrorsQuantity)
 *    bestGroup        : grupo vencedor
 *
 * ═══ EXEMPLOS DE USO ══════════════════════════════════════════════════════════
 *
 *  ── Domínio 1: dialetos regionais (input = texto) ─────────────────────────
 *
 *    const { FuzzyEngine } = require('./FuzzyEngine');
 *
 *    const dialectRules = {
 *      baiano: {
 *        name: 'Baiano (Bahia)',
 *        ruleGroups: [
 *          ['oxe', 'vixe'],
 *          ['oxe'],
 *          ['vixe'],
 *        ]
 *      }
 *    };
 *
 *    const engine = new FuzzyEngine(dialectRules);
 *    const result = engine.infer('oxe que saudade');
 *    // result.dominantEntity   → 'baiano'
 *    // result.confidence       → 1.0
 *
 *  ── Domínio 2: juntas de pipeline industrial (input = objeto) ─────────────
 *
 *    const pipelineRules = {
 *      socketWeld: {
 *        name: 'Solda de Soquete (ASME B16.11)',
 *        ruleGroups: [
 *          [e => e.pressure > 150, e => e.nominalDiameter <= 50, e => e.temp > 100],
 *          [e => e.pressure > 120, e => e.nominalDiameter <= 75]
 *        ]
 *      },
 *      flanged: {
 *        name: 'Junta Flangeada (ASME B16.5)',
 *        ruleGroups: [
 *          [e => e.pressure > 200, e => e.nominalDiameter > 50],
 *          [e => e.requiresMaintenance === true, e => e.nominalDiameter > 100]
 *        ]
 *      }
 *    };
 *
 *    const engine = new FuzzyEngine(pipelineRules);
 *    const result = engine.infer({ pressure: 160, nominalDiameter: 40, temp: 120 });
 *    // result.dominantEntity → 'socketWeld'
 *    // result.confidence     → 1.0
 *    // result.inferences.flanged.conditionsNotMet → ['condition[0]', 'condition[1]']
 *
 *  ── Domínio 3: mix (texto + funções no mesmo grupo) ───────────────────────
 *
 *    const rules = {
 *      highRisk: {
 *        name: 'Alto Risco',
 *        ruleGroups: [
 *          ['crítico', e => e.score > 80],          // string AND função
 *          [e => e.score > 95]
 *        ]
 *      }
 *    };
 */

class FuzzyEngine {
    /**
     * @param {Object} rulesConfig - Configuração de regras (ver formato acima)
     */
    constructor(rulesConfig) {
        if (!rulesConfig || typeof rulesConfig !== 'object' || Array.isArray(rulesConfig)) {
            throw new Error('FuzzyEngine: rulesConfig deve ser um objeto { entityKey: { name, ruleGroups } }');
        }
        this._rules = rulesConfig;
    }

    // ─── Métodos internos ──────────────────────────────────────────────────────

    /**
     * Avalia uma única condição contra o input.
     *
     * @param {string|Function} condition
     * @param {*}               input      - texto (string) ou objeto estruturado
     * @returns {boolean}
     */
    _evaluateCondition(condition, input) {
        if (typeof condition === 'function') {
            try   { return Boolean(condition(input)); }
            catch { return false; }
        }
        // string: busca por inclusão no texto
        return String(input).toLowerCase().includes(String(condition).toLowerCase());
    }

    /**
     * Avalia um grupo AND completo.
     * Análogo ao processamento de um bloco OR dentro de GetBruteInferenceCollection.
     *
     * @param {Array}  group
     * @param {*}      input
     * @returns {{ satisfied: number, errors: number, conditionsNotMet: string[] }}
     */
    _evaluateGroup(group, input) {
        let satisfied = 0;
        const conditionsNotMet = [];

        for (let i = 0; i < group.length; i++) {
            const condition = group[i];
            if (this._evaluateCondition(condition, input)) {
                satisfied++;
            } else {
                // Rótulo legível: usa o termo para strings, índice para funções
                conditionsNotMet.push(
                    typeof condition === 'string' ? condition : `condition[${i}]`
                );
            }
        }

        return {
            satisfied,
            errors:          group.length - satisfied,
            conditionsNotMet                            // PropertiesNeedToChange
        };
    }

    /**
     * Infere o resultado para uma única entidade do rulesConfig.
     * Implementa GetBruteInferenceCollection + InferenceInternal.
     *
     * Seleção do melhor grupo:
     *   Principal : argmin(errors)
     *   Desempate : maior número de condições satisfeitas
     *               (grupo mais específico — melhor discriminação)
     *
     * @param {{ name: string, ruleGroups: Array }} entityRules
     * @param {*} input
     * @returns {{ inferenceResult, conditionsNotMet, errorsQuantity, bestGroup }}
     */
    _inferEntity(entityRules, input) {
        let bestGroup            = null;
        let bestSatisfied        = -1;
        let bestErrors           = Infinity;
        let bestConditionsNotMet = [];

        for (const group of entityRules.ruleGroups) {
            const { satisfied, errors, conditionsNotMet } = this._evaluateGroup(group, input);

            const strictlyBetter = errors < bestErrors;
            const tied           = errors === bestErrors;
            const betterTie      = tied && (
                satisfied > bestSatisfied ||
                (satisfied === bestSatisfied && group.length > (bestGroup?.length ?? 0))
            );

            if (strictlyBetter || betterTie) {
                bestErrors           = errors;
                bestSatisfied        = satisfied;
                bestGroup            = group;
                bestConditionsNotMet = conditionsNotMet;
            }
        }

        const total           = bestGroup?.length ?? 1;
        const inferenceResult = parseFloat((bestSatisfied / total).toFixed(2));

        return {
            inferenceResult,                           // InferenceResult  [0.00, 1.00]
            conditionsNotMet: bestConditionsNotMet,    // PropertiesNeedToChange
            errorsQuantity:   bestErrors,              // ErrorsQuantity
            bestGroup:        bestGroup ?? []
        };
    }

    // ─── API pública ───────────────────────────────────────────────────────────

    /**
     * Executa a inferência fuzzy para todas as entidades do rulesConfig.
     *
     * @param {string|Object} input          - Texto ou objeto a classificar
     * @param {string|null}   priorEntityKey - Entidade com prior (ex: região declarada)
     * @param {number}        priorBonus     - Bônus aplicado ao prior [0, 1] (default: 0.20)
     *
     * @returns {FuzzyResult}
     * {
     *   dominantEntity : string|null,      // chave da entidade vencedora
     *   dominantName   : string,           // nome amigável
     *   confidence     : number,           // InferenceResult da dominante [0, 1]
     *   inferences     : {                 // resultado completo por entidade
     *     [entityKey]: {
     *       name             : string,
     *       inferenceResult  : number,     // [0.00, 1.00]
     *       conditionsNotMet : string[],   // PropertiesNeedToChange
     *       errorsQuantity   : number,     // ErrorsQuantity
     *       bestGroup        : Array       // grupo vencedor (AND conditions)
     *     }
     *   }
     * }
     */
    infer(input, priorEntityKey = null, priorBonus = 0.20) {
        const inferences = {};

        for (const [key, entityRules] of Object.entries(this._rules)) {
            const result = this._inferEntity(entityRules, input);

            // Prior bayesiano leve: se o chamador declarou esta entidade,
            // incrementa o resultado caso já haja algum sinal positivo
            if (priorEntityKey && key === priorEntityKey && result.inferenceResult > 0) {
                result.inferenceResult = Math.min(
                    1.00,
                    parseFloat((result.inferenceResult + priorBonus).toFixed(2))
                );
            }

            inferences[key] = {
                name:             entityRules.name,
                inferenceResult:  result.inferenceResult,
                conditionsNotMet: result.conditionsNotMet,
                errorsQuantity:   result.errorsQuantity,
                bestGroup:        result.bestGroup
            };
        }

        // Dominante = argmax(inferenceResult)
        let dominantKey = null;
        let maxResult   = 0;

        for (const [key, inf] of Object.entries(inferences)) {
            if (inf.inferenceResult > maxResult) {
                maxResult   = inf.inferenceResult;
                dominantKey = key;
            }
        }

        return {
            dominantEntity: dominantKey,
            dominantName:   dominantKey
                ? inferences[dominantKey].name
                : 'Neutro (nenhuma entidade correspondida)',
            confidence:     maxResult,
            inferences
        };
    }

    /**
     * Retorna as chaves de entidade definidas no rulesConfig.
     * Útil para inspecionar o domínio carregado.
     *
     * @returns {string[]}
     */
    get entityKeys() {
        return Object.keys(this._rules);
    }
}

module.exports = { FuzzyEngine };
