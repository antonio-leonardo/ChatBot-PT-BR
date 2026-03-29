/**
 * train.js — Treinamento do modelo NLP com todos os corpora regionais
 *
 * Usa NlpManager (node-nlp) diretamente — mesmo loader do botResponse.js,
 * garantindo que o model.nlp salvo seja compatível com manager.import().
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
];

(async () => {
    console.log('════════════════════════════════════════════════════');
    console.log('  Treinamento com corpora regionais');
    console.log('════════════════════════════════════════════════════');

    const manager = new NlpManager({
        languages: ['pt', 'en'],
        forceNER: true,
        autoSave: false,
        modelFileName: 'model.nlp'
    });

    for (const corpus of CORPORA) {
        const corpusPath = path.join(__dirname, corpus);
        try {
            await manager.addCorpus(corpusPath);
            console.log(`  ✓ Carregado: ${corpus}`);
        } catch (err) {
            console.warn(`  ✗ Falha ao carregar ${corpus}: ${err.message}`);
        }
    }

    console.log('\n  Treinando modelo...');
    await manager.train();

    manager.save('model.nlp');

    console.log('\n════════════════════════════════════════════════════');
    console.log('  Treinamento concluído! Modelo salvo em model.nlp');
    console.log(`  Corpora processados: ${CORPORA.length}`);
    console.log('════════════════════════════════════════════════════');
})();
