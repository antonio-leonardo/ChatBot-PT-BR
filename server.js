const express = require('express');
const { botResponse, reloadModel } = require('./botResponse');
const { mapLocalidadeToRegionKey } = require('./fuzzyClassifier');
const train = require('./train');
const {
    startFeedbackScheduler,
    registerFeedback,
    retrainWithFeedback,
    getPipelineStatus,
} = require('./feedbackPipeline');
const {
    addKnowledgeSource,
    addKnowledgeSources,
    listKnowledgeSources,
    searchKnowledge,
} = require('./knowledgeBase');
const { getFeedbackStats } = require('./feedbackStore');

const app = express();

app.use(express.json({ limit: '1mb' }));

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function validateChatInput(message, localidade, sourceLabel) {
    const userMessage = normalizeText(message);
    const userLocalidade = normalizeText(localidade);

    if (!userMessage) {
        throw new Error(`Missing or empty "message" ${sourceLabel}`);
    }
    if (!userLocalidade) {
        throw new Error(`Missing or empty "localidade" ${sourceLabel}`);
    }
    if (userMessage.length > 500) {
        throw new Error('"message" is too long (max 500 characters)');
    }
    if (userLocalidade.length > 100) {
        throw new Error('"localidade" is too long (max 100 characters)');
    }

    return {
        userMessage,
        userLocalidade,
    };
}

async function processChatRequest(message, localidade) {
    const regionKey = mapLocalidadeToRegionKey(localidade);
    const userContext = { regionKey };
    return botResponse(message, userContext);
}

app.get('/chat', async (req, res) => {
    try {
        const { userMessage, userLocalidade } = validateChatInput(
            req.query.message,
            req.query.localidade,
            'query parameter'
        );

        const response = await processChatRequest(userMessage, userLocalidade);
        res.send(response.message || '(Nao entendi. Pode reformular?)');
    } catch (err) {
        res.status(400).send(err.message);
    }
});

app.post('/chat', async (req, res) => {
    try {
        const body = req.body || {};
        const { userMessage, userLocalidade } = validateChatInput(
            body.message,
            body.localidade,
            'in request body'
        );

        const response = await processChatRequest(userMessage, userLocalidade);
        res.send(response.message || '(Nao entendi. Pode reformular?)');
    } catch (err) {
        res.status(400).send(err.message);
    }
});

app.post('/feedback', async (req, res) => {
    try {
        const body = req.body || {};
        const result = await registerFeedback({
            message: body.message,
            expectedAnswer: body.expectedAnswer,
            localidade: body.localidade,
            intent: body.intent,
            approved: body.approved,
            source: body.source || 'api',
        });

        res.status(201).json({
            status: 'queued',
            feedback: result.entry,
            stats: result.stats,
            retrainIntervalMs: Number(process.env.FEEDBACK_RETRAIN_INTERVAL_MS || 10 * 60 * 1000),
        });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

app.post('/feedback/retrain', async (_req, res) => {
    const result = await retrainWithFeedback('manual');
    const statusCode = result.status === 'error' ? 500 : 200;
    res.status(statusCode).json(result);
});

app.get('/feedback/status', async (_req, res) => {
    const stats = await getFeedbackStats();
    res.json({
        feedback: stats,
        pipeline: getPipelineStatus(),
    });
});

app.post('/knowledge/sources', async (req, res) => {
    try {
        const body = req.body || {};
        if (Array.isArray(body.sources)) {
            const sources = await addKnowledgeSources(body.sources);
            return res.status(201).json({ status: 'created', total: sources.length, sources });
        }

        const source = await addKnowledgeSource({
            title: body.title,
            content: body.content,
            answer: body.answer,
            url: body.url,
            tags: body.tags,
        });

        res.status(201).json({ status: 'created', source });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

app.get('/knowledge/sources', async (_req, res) => {
    const sources = await listKnowledgeSources();
    res.json({ total: sources.length, sources });
});

app.get('/knowledge/search', async (req, res) => {
    const query = normalizeText(req.query.query);
    if (!query) {
        return res.status(400).json({ status: 'error', message: 'Missing "query" parameter.' });
    }

    const topK = Number(req.query.topK) || 3;
    const results = await searchKnowledge(query, { topK, minScore: 0.1 });
    return res.json({ query, total: results.length, results });
});

app.listen(3000, () => {
    startFeedbackScheduler();

    train.train()
        .then(() => reloadModel())
        .catch((err) => {
            console.error(`[startup] Training failed: ${err.message}`);
        });

    console.log('Server running on port 3000');
});

