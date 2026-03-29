const { NlpManager } = require('node-nlp');

const manager = new NlpManager({ languages: ['pt'], forceNER: true });
// Adds the utterances and intents for the NLP
manager.addDocument('pt', 'até logo!', 'greetings.bye');
manager.addDocument('pt', 'tchau, tchau, se cuida.', 'greetings.bye');
manager.addDocument('pt', 'ok, até mais tarde.', 'greetings.bye');
manager.addDocument('pt', 'adeus por agora', 'greetings.bye');
manager.addDocument('pt', 'eu tenho que ir', 'greetings.bye');
manager.addDocument('pt', 'olá', 'greetings.hello');
manager.addDocument('pt', 'oi', 'greetings.hello');

// Train also the NLG
manager.addAnswer('pt', 'greetings.bye', 'Até a próxima!');
manager.addAnswer('pt', 'greetings.bye', 'vejo você em breve!');
manager.addAnswer('pt', 'greetings.hello', 'Ei!');
manager.addAnswer('pt', 'greetings.hello', 'Saudações!');

// Train and save the model.
(async() => {
    await manager.train();
    manager.save();
    const response = await manager.process('pt', 'I should go now');
    console.log(response);
})();