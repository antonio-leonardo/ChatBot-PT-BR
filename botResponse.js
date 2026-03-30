// load model and route message between NLP and local RAG
const fs = require('fs');
const path = require('path');
const { NlpManager } = require('node-nlp');
const { classifyRegion } = require('./fuzzyClassifier');
const { searchKnowledge } = require('./knowledgeBase');

const MODEL_PATH = path.join(__dirname, 'model.nlp');

let manager = null;
let modelLoadedAt = null;

function createManager() {
    return new NlpManager({ languages: ['pt', 'en'], forceNER: true });
}

function loadModelFromDisk() {
    const data = fs.readFileSync(MODEL_PATH, 'utf8');
    const loadedManager = createManager();
    loadedManager.import(data);
    manager = loadedManager;
    modelLoadedAt = new Date().toISOString();
    return modelLoadedAt;
}

function ensureManager() {
    if (manager) return manager;

    try {
        loadModelFromDisk();
    } catch (err) {
        console.warn(`[botResponse] Could not load model.nlp yet: ${err.message}`);
        manager = createManager();
    }

    return manager;
}

async function reloadModel() {
    const loadedAt = loadModelFromDisk();
    return { loadedAt };
}

function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function shouldUseRag(ragTopResult, nlpResponse) {
    if (!ragTopResult) return false;

    const ragMinScore = toFiniteNumber(process.env.RAG_MIN_SCORE, 0.45);
    const nlpCutoff = toFiniteNumber(process.env.RAG_PREFER_WHEN_NLP_BELOW, 0.72);

    const nlpScore = toFiniteNumber(nlpResponse?.score, 0);
    const hasNlpAnswer = Boolean(nlpResponse?.answer);

    return ragTopResult.score >= ragMinScore && (!hasNlpAnswer || nlpScore < nlpCutoff);
}

/**
 * Process user message and return bot response.
 *
 * @param {string} user_message
 * @param {object} userContext
 * @returns {object}
 */
const botResponse = async (user_message, userContext = {}) => {
    const fuzzyResult = classifyRegion(user_message, userContext.regionKey || null);

    const activeManager = ensureManager();
    const nlpResponse = await activeManager.process(user_message);

    const ragResults = await searchKnowledge(user_message, { topK: 3, minScore: 0.15 });
    const ragTopResult = ragResults[0] || null;

    const useRag = shouldUseRag(ragTopResult, nlpResponse);

    const message = useRag
        ? ragTopResult.answer
        : nlpResponse?.answer;

    return {
        message,
        source: useRag ? 'rag' : 'nlp',
        intent: nlpResponse?.intent,
        score: nlpResponse?.score,
        language: nlpResponse?.language,
        modelLoadedAt,
        rag: {
            used: useRag,
            best: ragTopResult,
            candidates: ragResults,
        },
        fuzzy: {
            detectedRegion: fuzzyResult.dominantRegion,
            detectedName: fuzzyResult.dominantName,
            confidence: fuzzyResult.confidence,
            inferences: fuzzyResult.inferences,
        },
    };
};

module.exports = {
    botResponse,
    reloadModel,
};

