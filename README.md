# ChatBot-PT-BR

Chatbot em Node.js com NLP, classificacao fuzzy de regionalismos, aprendizagem supervisionada por feedback e base de conhecimento com RAG local.

## Recursos

- NLP com `node-nlp` e corpus em portugues/ingles.
- Classificacao de dialeto regional por logica fuzzy.
- Aprendizagem via feedback supervisionado (`POST /feedback`).
- Retreino automatico periodico do modelo com feedback aprovado.
- Busca RAG local em fontes cadastradas (`POST /knowledge/sources`).

## Instalar

```bash
npm install
```

## Rodar

```bash
npm run build
```

Servidor sobe em `http://localhost:3000`.

## Variaveis de ambiente

- `FEEDBACK_RETRAIN_INTERVAL_MS` (padrao: `600000` = 10 minutos)
- `RAG_MIN_SCORE` (padrao: `0.45`)
- `RAG_PREFER_WHEN_NLP_BELOW` (padrao: `0.72`)

## Endpoints

### Chat

- `GET /chat?message=...&localidade=...`
- `POST /chat`

Body:

```json
{
  "message": "o que voce sabe sobre pix?",
  "localidade": "Sao Paulo"
}
```

### Feedback (aprendizagem)

- `POST /feedback`

Body:

```json
{
  "message": "qual seu nome?",
  "expectedAnswer": "Sou um agente virtual.",
  "localidade": "Bahia",
  "intent": "agent.name"
}
```

- `POST /feedback/retrain` (forca retreino imediato)
- `GET /feedback/status`

### Base de conhecimento (RAG)

- `POST /knowledge/sources`

Body:

```json
{
  "title": "Politica de trocas",
  "content": "Trocas podem ser solicitadas em ate 7 dias corridos.",
  "answer": "Voce pode solicitar troca em ate 7 dias corridos.",
  "tags": ["troca", "devolucao", "prazo"],
  "url": "https://exemplo.com/politica"
}
```

Body em lote:

```json
{
  "sources": [
    {
      "title": "FAQ de Entrega",
      "content": "Entregas acontecem em ate 5 dias uteis.",
      "answer": "O prazo padrao de entrega e de ate 5 dias uteis.",
      "tags": ["entrega", "prazo"]
    },
    {
      "title": "Politica de Reembolso",
      "content": "Reembolso pode ser solicitado em ate 30 dias.",
      "tags": ["reembolso", "financeiro"]
    }
  ]
}
```

- `GET /knowledge/sources`
- `GET /knowledge/search?query=...&topK=3`

## Arquivos importantes

- `train.js`: treino base + feedback.
- `botResponse.js`: decisao NLP x RAG e resposta final.
- `feedbackPipeline.js`: scheduler de retreino automatico.
- `feedbackStore.js`: armazenamento de feedback.
- `feedbackCorpus.js`: geracao de corpus de feedback.
- `knowledgeBase.js`: armazenamento e busca RAG.

