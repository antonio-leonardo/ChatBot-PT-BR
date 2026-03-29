/**
 * fuzzyClassifier.js — Adaptador de domínio: Dialetos Regionais Brasileiros
 *
 * Responsabilidade única: definir as regras regionais e expor a API do chatbot.
 * Toda a lógica de inferência está em FuzzyEngine.js (genérico e reutilizável).
 */

const { FuzzyEngine } = require('./FuzzyEngine');

// ─────────────────────────────────────────────────────────────────────────────
// Regras de domínio: dialetos regionais brasileiros
//
// Formato: cada entrada é uma entidade fuzzy com grupos AND/OR de marcadores.
// Condições são strings → FuzzyEngine verifica inclusão no texto da mensagem.
//
// Design dos grupos:
//   Grupos de 3 termos → alta especificidade (combinações exclusivamente regionais)
//   Grupos de 2 termos → especificidade média
//   Grupos de 1 termo  → marcadores únicos da região (certeza isolada)
// ─────────────────────────────────────────────────────────────────────────────
const REGIONAL_RULES = {

    baiano: {
        name: 'Baiano (Bahia)',
        ruleGroups: [
            ['oxe', 'vixe', 'mainha'],
            ['oxe', 'eita', 'arretado'],
            ['oxe', 'vixe'],
            ['oxe', 'mainha'],
            ['oxi', 'vixe'],
            ['vixe', 'arretado'],
            ['eita', 'mainha'],
            ['eita', 'axé'],
            ['besta', 'axé'],
            ['nego', 'axé'],
            ['oxe'],
            ['oxi'],
            ['vixe'],
            ['vixi'],
            ['abestado'],
            ['vapo'],
            ['maninha'],
            ['painho'],
            ['moral'],
            ['xique xique'],
        ]
    },

    carioca: {
        name: 'Carioca (Rio de Janeiro)',
        ruleGroups: [
            ['mermão', 'firmeza', 'saquei'],
            ['mermão', 'galera', 'irado'],
            ['mermão', 'firmeza'],
            ['mermão', 'irado'],
            ['firmeza', 'saquei'],
            ['galera', 'irado'],
            ['bicho', 'firmeza'],
            ['salve', 'galera'],
            ['tá na moral', 'firmeza'],
            ['bonde', 'galera'],
            ['mermão'],
            ['mermã'],
            ['firmeza'],
            ['saquei'],
            ['tá na moral'],
            ['bonde'],
            ['carioca'],
        ]
    },

    paulistano: {
        name: 'Paulistano (São Paulo)',
        ruleGroups: [
            ['mano', 'brow', 'sinistro'],
            ['mano', 'véio', 'sô'],
            ['brow', 'sinistro'],
            ['mano', 'sinistro'],
            ['véio', 'sô'],
            ['tipo assim', 'mano'],
            ['demais da conta', 'mano'],
            ['é nóis', 'mano'],
            ['cê', 'véio'],
            ['brow'],
            ['sinistro'],
            ['sampa'],
            ['paulista'],
            ['é nóis'],
            ['demais da conta'],
            ['tipo assim'],
        ]
    },

    gaucho: {
        name: 'Gaúcho (Sul do Brasil — RS/SC/PR)',
        ruleGroups: [
            ['tchê', 'bah', 'piá'],
            ['tchê', 'bah', 'guri'],
            ['bah tchê', 'tri'],
            ['tchê', 'bah'],
            ['tchê', 'guri'],
            ['bah', 'piá'],
            ['guri', 'tri'],
            ['piá', 'tri'],
            ['barbaridade', 'tchê'],
            ['chimarrão', 'tchê'],
            ['bagual', 'guri'],
            ['tchê'],
            ['bah tchê'],
            ['piá'],
            ['tri bom'],
            ['chimarrão'],
            ['xiru'],
            ['bagual'],
            ['gaúcho'],
        ]
    },

    nordestino: {
        name: 'Nordestino (Nordeste — exceto BA)',
        ruleGroups: [
            ['cabra da peste', 'arretado', 'eita'],
            ['minha fia', 'eita', 'rapaz'],
            ['cabra da peste', 'eita'],
            ['minha fia', 'eita'],
            ['minha fia', 'rapaz'],
            ['égua', 'rapaz'],
            ['eita', 'sertão'],
            ['arretado', 'cabra'],
            ['eita', 'nordestino'],
            ['forró', 'nordestino'],
            ['cabra da peste'],
            ['minha fia'],
            ['meu fia'],
            ['égua'],
            ['visse'],
            ['nordestino'],
            ['forró'],
        ]
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Instância do motor fuzzy com as regras regionais
// ─────────────────────────────────────────────────────────────────────────────
const _engine = new FuzzyEngine(REGIONAL_RULES);

// ─────────────────────────────────────────────────────────────────────────────
// API pública do classificador
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classifica o dialeto regional de uma mensagem.
 *
 * Delega inteiramente ao FuzzyEngine — este módulo só define o domínio.
 *
 * @param {string}      message        - Mensagem do usuário
 * @param {string|null} declaredRegion - Chave da região declarada (prior)
 * @returns {FuzzyResult}              - Ver FuzzyEngine.infer()
 */
function classifyRegion(message, declaredRegion = null) {
    return _engine.infer(message, declaredRegion);
}

/**
 * Mapeia strings de localidade digitadas pelo usuário para chaves internas.
 *
 * @param {string} input
 * @returns {string|null}
 */
function mapLocalidadeToRegionKey(input) {
    const normalized = input.toLowerCase().trim();

    const map = [
        { key: 'baiano',     patterns: ['bahia', 'ba', 'baiano', 'baiana', 'salvador', 'baianes'] },
        { key: 'carioca',    patterns: ['rio', 'rj', 'rio de janeiro', 'carioca', 'fluminense'] },
        { key: 'paulistano', patterns: ['são paulo', 'sp', 'sao paulo', 'paulistano', 'paulista', 'sampa'] },
        { key: 'gaucho',     patterns: ['rio grande do sul', 'rs', 'gaúcho', 'gaucho', 'santa catarina', 'sc', 'paraná', 'pr', 'sul', 'sulista'] },
        { key: 'nordestino', patterns: ['nordeste', 'nordestino', 'ceará', 'ce', 'pernambuco', 'pe', 'paraíba', 'pb', 'maranhão', 'ma', 'piauí', 'pi', 'alagoas', 'al', 'sergipe', 'se', 'rio grande do norte', 'rn'] },
    ];

    for (const { key, patterns } of map) {
        if (patterns.some(p => normalized.includes(p))) return key;
    }
    return null;
}

module.exports = { classifyRegion, mapLocalidadeToRegionKey, REGIONAL_RULES };
