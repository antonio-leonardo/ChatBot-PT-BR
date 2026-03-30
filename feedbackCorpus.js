const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FEEDBACK_CORPUS_PATH = path.join(__dirname, 'corpus-feedback.json');

function sanitizeIntent(rawIntent) {
    return String(rawIntent || '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function hashText(text) {
    return crypto.createHash('sha1').update(String(text || ''), 'utf8').digest('hex').slice(0, 12);
}

function resolveIntent(entry) {
    const customIntent = sanitizeIntent(entry.intent);
    if (customIntent) {
        return customIntent.startsWith('feedback.') ? customIntent : `feedback.${customIntent}`;
    }
    return `feedback.answer.${hashText(entry.expectedAnswer)}`;
}

function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function buildFeedbackCorpus(entries = []) {
    const grouped = new Map();

    for (const entry of entries) {
        const intent = resolveIntent(entry);
        if (!grouped.has(intent)) {
            grouped.set(intent, { utterances: [], answers: [] });
        }
        const current = grouped.get(intent);
        current.utterances.push(String(entry.message || '').trim());
        current.answers.push(String(entry.expectedAnswer || '').trim());
    }

    const data = Array.from(grouped.entries())
        .map(([intent, payload]) => ({
            intent,
            utterances: uniqueSorted(payload.utterances),
            answers: uniqueSorted(payload.answers),
        }))
        .filter((item) => item.utterances.length > 0 && item.answers.length > 0)
        .sort((a, b) => a.intent.localeCompare(b.intent));

    return {
        name: 'Feedback Corpus',
        locale: 'pt-BR',
        data,
    };
}

async function writeFeedbackCorpus(corpus) {
    const serialized = `${JSON.stringify(corpus, null, 2)}\n`;
    await fs.promises.writeFile(FEEDBACK_CORPUS_PATH, serialized, 'utf8');
    return FEEDBACK_CORPUS_PATH;
}

function countUtterances(corpus) {
    if (!corpus || !Array.isArray(corpus.data)) return 0;
    return corpus.data.reduce((total, item) => total + (item.utterances?.length || 0), 0);
}

module.exports = {
    FEEDBACK_CORPUS_PATH,
    buildFeedbackCorpus,
    writeFeedbackCorpus,
    countUtterances,
};
