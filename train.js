/**
 * train.js - model training with base corpora + generated feedback corpus.
 */

const path = require('path');
const { NlpManager } = require('node-nlp');

const CORPORA = [
    'corpus-pt-br.json',
    'corpus-pt-br-baianes.json',
    'corpus-pt-br-carioca.json',
    'corpus-pt-br-gaucho.json',
    'corpus-pt-br-nordestino.json',
    'corpus-pt-br-paulistano.json',
    'corpus-en-us.json',
    'corpus-feedback.json',
];

let trainingPromise = null;

async function executeTraining() {
    console.log('====================================================');
    console.log('  Training model with corpora');
    console.log('====================================================');

    const manager = new NlpManager({
        languages: ['pt', 'en'],
        forceNER: true,
        autoSave: false,
        modelFileName: 'model.nlp',
    });

    let loadedCorpora = 0;
    for (const corpus of CORPORA) {
        const corpusPath = path.join(__dirname, corpus);
        try {
            await manager.addCorpus(corpusPath);
            loadedCorpora += 1;
            console.log(`  [ok] Loaded: ${corpus}`);
        } catch (err) {
            console.warn(`  [warn] Could not load ${corpus}: ${err.message}`);
        }
    }

    console.log('\n  Training...');
    await manager.train();
    manager.save('model.nlp');

    console.log('\n====================================================');
    console.log('  Training complete. Model saved to model.nlp');
    console.log(`  Corpora loaded: ${loadedCorpora}/${CORPORA.length}`);
    console.log('====================================================');
}

async function train() {
    if (trainingPromise) {
        console.log('[train] Training already running, waiting for current run.');
        return trainingPromise;
    }

    trainingPromise = executeTraining().finally(() => {
        trainingPromise = null;
    });

    return trainingPromise;
}

module.exports = {
    train,
    CORPORA,
};

if (require.main === module) {
    train().catch((err) => {
        console.error(`[train] Fatal error: ${err.message}`);
        process.exitCode = 1;
    });
}

