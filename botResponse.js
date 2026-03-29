// load model here
const fs = require('fs');
const { NlpManager } = require('node-nlp');
const { classifyRegion } = require('./fuzzyClassifier');

const data = fs.readFileSync('model.nlp', 'utf8');
const manager = new NlpManager({ languages: ['pt'], forceNER: true });
manager.import(data);

/**
 * Processa a mensagem do usuário e retorna a resposta do bot.
 *
 * @param {string} user_message  - Texto enviado pelo usuário
 * @param {object} userContext   - Contexto do usuário: { name, regionKey }
 *                                 regionKey: chave do conjunto fuzzy declarado pelo usuário
 *                                 (baiano | carioca | paulistano | gaucho | nordestino | null)
 * @returns {object} - { message, intent, score, language, fuzzy }
 */
const botResponse = async (user_message, userContext = {}) => {
    // ── Classificação fuzzy do dialeto da mensagem ──────────────────────────
    const fuzzyResult = classifyRegion(user_message, userContext.regionKey || null);

    // ── Processamento NLP ───────────────────────────────────────────────────
    const response = await manager.process(user_message);

    const return_response = {
        message:  response?.answer,
        intent:   response?.intent,
        score:    response?.score,
        language: response?.language,
        fuzzy: {
            detectedRegion:  fuzzyResult.dominantRegion,
            detectedName:    fuzzyResult.dominantName,
            confidence:      fuzzyResult.confidence,
            inferences:      fuzzyResult.inferences   // resultado completo por região
        }
    };

    return return_response;
};

module.exports = { botResponse };
