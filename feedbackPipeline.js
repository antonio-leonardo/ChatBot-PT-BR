const { addFeedback, getApprovedFeedback, getFeedbackStats } = require('./feedbackStore');
const { buildFeedbackCorpus, writeFeedbackCorpus, countUtterances } = require('./feedbackCorpus');
const train = require('./train');
const { reloadModel } = require('./botResponse');

const DEFAULT_INTERVAL_MS = Number(process.env.FEEDBACK_RETRAIN_INTERVAL_MS || 10 * 60 * 1000);

let schedulerTimer = null;
let running = false;
let totalRetrains = 0;
let lastProcessedApprovedCount = 0;
let lastRunAt = null;
let lastRetrainAt = null;
let lastRunStatus = 'idle';

async function buildCorpusFromApprovedFeedback() {
    const approved = await getApprovedFeedback();
    const corpus = buildFeedbackCorpus(approved);
    await writeFeedbackCorpus(corpus);
    return {
        approvedCount: approved.length,
        utteranceCount: countUtterances(corpus),
        intents: corpus.data.length,
    };
}

async function retrainWithFeedback(reason = 'scheduled') {
    if (running) {
        return {
            status: 'skipped',
            reason: 'pipeline-already-running',
            lastRunStatus,
        };
    }

    running = true;
    lastRunAt = new Date().toISOString();

    try {
        const summary = await buildCorpusFromApprovedFeedback();
        const hasNewApprovedFeedback = summary.approvedCount > lastProcessedApprovedCount;

        if (!hasNewApprovedFeedback && reason !== 'manual') {
            lastRunStatus = 'no-changes';
            return {
                status: 'no-changes',
                ...summary,
                lastProcessedApprovedCount,
            };
        }

        await train.train();
        await reloadModel();

        totalRetrains += 1;
        lastProcessedApprovedCount = summary.approvedCount;
        lastRetrainAt = new Date().toISOString();
        lastRunStatus = 'retrained';

        return {
            status: 'retrained',
            reason,
            retrains: totalRetrains,
            ...summary,
            lastRetrainAt,
        };
    } catch (err) {
        lastRunStatus = 'error';
        return {
            status: 'error',
            reason,
            message: err.message,
        };
    } finally {
        running = false;
    }
}

async function registerFeedback(payload = {}) {
    const entry = await addFeedback(payload);
    const stats = await getFeedbackStats();
    return { entry, stats };
}

function startFeedbackScheduler() {
    if (schedulerTimer) {
        return schedulerTimer;
    }

    schedulerTimer = setInterval(() => {
        retrainWithFeedback('scheduled').catch((err) => {
            lastRunStatus = 'error';
            console.error(`[feedback-pipeline] Scheduled retrain failed: ${err.message}`);
        });
    }, DEFAULT_INTERVAL_MS);

    // Optional: do not keep process open only because of the timer.
    if (typeof schedulerTimer.unref === 'function') {
        schedulerTimer.unref();
    }

    // Warm-up pass to ensure corpus-feedback.json exists.
    retrainWithFeedback('startup').catch((err) => {
        lastRunStatus = 'error';
        console.error(`[feedback-pipeline] Startup warm-up failed: ${err.message}`);
    });

    return schedulerTimer;
}

function getPipelineStatus() {
    return {
        intervalMs: DEFAULT_INTERVAL_MS,
        running,
        totalRetrains,
        lastProcessedApprovedCount,
        lastRunAt,
        lastRetrainAt,
        lastRunStatus,
    };
}

module.exports = {
    startFeedbackScheduler,
    registerFeedback,
    retrainWithFeedback,
    getPipelineStatus,
};
