const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FEEDBACK_LOG_PATH = path.join(__dirname, 'feedback-log.jsonl');
const MAX_MESSAGE_LENGTH = 500;
const MAX_ANSWER_LENGTH = 1000;
const MAX_INTENT_LENGTH = 120;
const MAX_LOCALIDADE_LENGTH = 100;

function ensureLogFile() {
    if (!fs.existsSync(FEEDBACK_LOG_PATH)) {
        fs.writeFileSync(FEEDBACK_LOG_PATH, '', 'utf8');
    }
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function generateId() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validateFeedbackInput(input) {
    const message = normalizeText(input.message);
    const expectedAnswer = normalizeText(input.expectedAnswer);
    const localidade = normalizeText(input.localidade);
    const intent = normalizeText(input.intent);

    if (!message) {
        throw new Error('Field "message" is required.');
    }
    if (!expectedAnswer) {
        throw new Error('Field "expectedAnswer" is required.');
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        throw new Error(`"message" is too long (max ${MAX_MESSAGE_LENGTH} characters).`);
    }
    if (expectedAnswer.length > MAX_ANSWER_LENGTH) {
        throw new Error(`"expectedAnswer" is too long (max ${MAX_ANSWER_LENGTH} characters).`);
    }
    if (localidade.length > MAX_LOCALIDADE_LENGTH) {
        throw new Error(`"localidade" is too long (max ${MAX_LOCALIDADE_LENGTH} characters).`);
    }
    if (intent.length > MAX_INTENT_LENGTH) {
        throw new Error(`"intent" is too long (max ${MAX_INTENT_LENGTH} characters).`);
    }

    return { message, expectedAnswer, localidade, intent };
}

function parseLogEntries(content) {
    return content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line);
            } catch (err) {
                return null;
            }
        })
        .filter(Boolean);
}

async function addFeedback(input = {}) {
    ensureLogFile();

    const validated = validateFeedbackInput(input);
    const entry = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        message: validated.message,
        expectedAnswer: validated.expectedAnswer,
        localidade: validated.localidade || null,
        intent: validated.intent || null,
        approved: input.approved !== false,
        source: normalizeText(input.source) || 'api',
    };

    await fs.promises.appendFile(FEEDBACK_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
}

async function getAllFeedback() {
    ensureLogFile();
    const content = await fs.promises.readFile(FEEDBACK_LOG_PATH, 'utf8');
    return parseLogEntries(content);
}

async function getApprovedFeedback() {
    const entries = await getAllFeedback();
    return entries.filter((entry) => entry.approved !== false);
}

async function getFeedbackStats() {
    const entries = await getAllFeedback();
    const approvedCount = entries.filter((entry) => entry.approved !== false).length;
    return {
        total: entries.length,
        approved: approvedCount,
        pendingReview: entries.length - approvedCount,
    };
}

module.exports = {
    FEEDBACK_LOG_PATH,
    addFeedback,
    getAllFeedback,
    getApprovedFeedback,
    getFeedbackStats,
};
