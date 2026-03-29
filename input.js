const { botResponse } = require('./botResponse');
const { mapLocalidadeToRegionKey, REGIONAL_RULES } = require('./fuzzyClassifier');

// ─────────────────────────────────────────────────────────────────────────────
// Máquina de estados do onboarding
// Estados: WAITING_NAME → WAITING_REGION → CHATTING
// ─────────────────────────────────────────────────────────────────────────────
const STATE = {
    WAITING_NAME:   'waiting_name',
    WAITING_REGION: 'waiting_region',
    CHATTING:       'chatting'
};

let currentState = STATE.WAITING_NAME;
const userContext = {
    name:      null,
    regionKey: null,
    regionName: null
};

// Regiões disponíveis para exibição
const REGIOES_DISPONIVEIS = [
    'Bahia (BA)',
    'Rio de Janeiro (RJ)',
    'São Paulo (SP)',
    'Sul — RS / SC / PR',
    'Nordeste — CE, PE, PB, MA, PI, AL, SE, RN',
    'Outra / Não informar'
];

function printDivider() {
    console.log('─'.repeat(55));
}

function botSay(msg) {
    console.log(`\nBot: ${msg}`);
}

function promptUser() {
    process.stdout.write('\nVocê: ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────────────────────────────────────
printDivider();
console.log('  Chatbot com Reconhecimento de Regionalismos');
console.log('  Desenvolvido por Antonio Leonardo');
printDivider();
botSay('Olá! Antes de começarmos, preciso te conhecer melhor.');
botSay('Qual é o seu nome?');
promptUser();

// ─────────────────────────────────────────────────────────────────────────────
// Loop de entrada
// ─────────────────────────────────────────────────────────────────────────────
process.stdin.on('data', async (data) => {
    const input = data.toString().trim();

    // Comando de saída global
    if (input.toLowerCase() === 'sair' || input.toLowerCase() === 'exit') {
        const farewell = userContext.name ? `, ${userContext.name}` : '';
        botSay(`Ok, até logo${farewell}! Foi um prazer conversar.`);
        process.exit();
    }

    // ── Estado: aguardando nome ─────────────────────────────────────────────
    if (currentState === STATE.WAITING_NAME) {
        if (input.length === 0) {
            botSay('Por favor, informe seu nome para continuarmos.');
            promptUser();
            return;
        }

        userContext.name = input;
        currentState = STATE.WAITING_REGION;

        botSay(`Prazer, ${userContext.name}! 😊`);
        botSay('De qual localidade você é? Isso me ajuda a conversar melhor com você.\n');

        REGIOES_DISPONIVEIS.forEach((r, i) => {
            console.log(`  [${i + 1}] ${r}`);
        });

        botSay('Digite o número, o nome da sua cidade/estado ou "pular" para não informar:');
        promptUser();
        return;
    }

    // ── Estado: aguardando região ───────────────────────────────────────────
    if (currentState === STATE.WAITING_REGION) {
        const skip = input.toLowerCase() === 'pular' || input === '6';

        if (!skip) {
            // Tenta mapear pelo número da lista
            const numChoice = parseInt(input, 10);
            let resolvedInput = input;

            if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= 5) {
                const regionLabels = ['bahia', 'rio de janeiro', 'são paulo', 'sul', 'nordeste'];
                resolvedInput = regionLabels[numChoice - 1];
            }

            userContext.regionKey  = mapLocalidadeToRegionKey(resolvedInput);
            userContext.regionName = resolvedInput;
        }

        currentState = STATE.CHATTING;
        printDivider();

        if (userContext.regionKey && REGIONAL_RULES[userContext.regionKey]) {
            const regionData = REGIONAL_RULES[userContext.regionKey];
            botSay(`Ótimo, ${userContext.name}! Identifiquei sua região como: ${regionData.name}`);
            botSay('Agora vou adaptar minha conversa ao seu dialeto regional!');
        } else {
            botSay(`Tudo bem, ${userContext.name}! Vamos conversar então.`);
        }

        botSay("Digite sua mensagem a qualquer momento. Para sair, digite 'sair'.");
        printDivider();
        promptUser();
        return;
    }

    // ── Estado: conversando ─────────────────────────────────────────────────
    if (currentState === STATE.CHATTING) {
        console.log(`\nVocê: ${input}`);

        try {
            const bot_response = await botResponse(input, userContext);

            botSay(bot_response.message || '(Não entendi. Pode reformular?)');

            // Diagnóstico fuzzy — espelha a saída de Inference<TEntity> do FuzzyLogicApi
            if (bot_response.fuzzy && bot_response.fuzzy.confidence > 0) {
                const f    = bot_response.fuzzy;
                const inf  = f.inferences?.[f.detectedRegion];
                console.log(`  [fuzzy] Região detectada : ${f.detectedName}`);
                console.log(`  [fuzzy] InferenceResult  : ${(f.confidence * 100).toFixed(0)}%`);
                if (inf) {
                    console.log(`  [fuzzy] Melhor grupo     : [${inf.bestGroup.join(', ')}]`);
                    if (inf.markersNotFound.length > 0) {
                        console.log(`  [fuzzy] Marcadores ausentes (PropertiesNeedToChange): [${inf.markersNotFound.join(', ')}]`);
                    }
                    console.log(`  [fuzzy] ErrorsQuantity   : ${inf.errorsQuantity}`);
                }
            }
        } catch (err) {
            botSay('Houve um erro ao processar sua mensagem. Tente novamente.');
        }

        promptUser();
    }
});
