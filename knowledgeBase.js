const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KNOWLEDGE_BASE_PATH = path.join(__dirname, 'knowledge-base.json');
const MAX_SOURCES = 5000;

const STOP_WORDS = new Set([
    'a', 'as', 'o', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
    'um', 'uma', 'uns', 'umas', 'para', 'por', 'com', 'sem', 'que', 'se', 'ao', 'aos', 'ou',
    'the', 'is', 'are', 'and', 'to', 'for', 'of', 'in', 'on', 'with', 'by', 'an', 'be'
]);

function defaultKnowledgeBase() {
    return { version: 1, sources: [] };
}

function normalizeText(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    return normalizeText(text)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function ensureKnowledgeBaseFile() {
    if (!fs.existsSync(KNOWLEDGE_BASE_PATH)) {
        fs.writeFileSync(KNOWLEDGE_BASE_PATH, `${JSON.stringify(defaultKnowledgeBase(), null, 2)}\n`, 'utf8');
    }
}

async function readKnowledgeBase() {
    ensureKnowledgeBaseFile();
    const raw = await fs.promises.readFile(KNOWLEDGE_BASE_PATH, 'utf8');
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.sources)) {
            return defaultKnowledgeBase();
        }
        return parsed;
    } catch (err) {
        return defaultKnowledgeBase();
    }
}

async function writeKnowledgeBase(data) {
    const payload = {
        version: 1,
        sources: Array.isArray(data.sources) ? data.sources.slice(0, MAX_SOURCES) : [],
    };
    await fs.promises.writeFile(KNOWLEDGE_BASE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sourceText(source) {
    const tags = Array.isArray(source.tags) ? source.tags.join(' ') : '';
    return `${source.title || ''} ${source.content || ''} ${source.answer || ''} ${tags}`;
}

function keywordBoost(queryTokens, sourceTags) {
    if (!Array.isArray(sourceTags) || sourceTags.length === 0) return 0;
    const tagTokens = new Set(sourceTags.map((tag) => normalizeText(tag)).filter(Boolean));
    const hasTagMatch = queryTokens.some((token) => tagTokens.has(token));
    return hasTagMatch ? 0.12 : 0;
}

function computeScore(query, source) {
    const queryTokens = Array.from(new Set(tokenize(query)));
    if (queryTokens.length === 0) return 0;

    const fullText = sourceText(source);
    const sourceTokens = new Set(tokenize(fullText));
    if (sourceTokens.size === 0) return 0;

    const matches = queryTokens.filter((token) => sourceTokens.has(token)).length;
    if (matches === 0) return 0;

    const recall = matches / queryTokens.length;
    const precision = matches / sourceTokens.size;
    const f1 = (2 * recall * precision) / Math.max(recall + precision, Number.EPSILON);

    const normalizedQuery = normalizeText(query);
    const normalizedContent = normalizeText(fullText);
    const normalizedTitle = normalizeText(source.title || '');

    const exactTitleBoost = normalizedQuery && normalizedTitle.includes(normalizedQuery) ? 0.2 : 0;
    const exactContentBoost = normalizedQuery && normalizedContent.includes(normalizedQuery) ? 0.15 : 0;
    const tagBoost = keywordBoost(queryTokens, source.tags);

    return Math.min(1, f1 + exactTitleBoost + exactContentBoost + tagBoost);
}

function makeSnippet(text, query) {
    const content = String(text || '').replace(/\s+/g, ' ').trim();
    if (!content) return '';

    const normalizedContent = normalizeText(content);
    const queryTokens = tokenize(query);
    let hitIndex = -1;
    for (const token of queryTokens) {
        hitIndex = normalizedContent.indexOf(token);
        if (hitIndex >= 0) break;
    }

    if (hitIndex < 0 || content.length <= 260) {
        return content.slice(0, 260);
    }

    const start = Math.max(0, hitIndex - 100);
    const end = Math.min(content.length, start + 260);
    return content.slice(start, end);
}

function validateSource(input = {}) {
    const title = String(input.title || '').trim();
    const content = String(input.content || '').trim();
    const answer = String(input.answer || '').trim();
    const url = String(input.url || '').trim() || null;
    const tags = Array.isArray(input.tags)
        ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
        : [];

    if (!title) {
        throw new Error('Field "title" is required.');
    }
    if (!content) {
        throw new Error('Field "content" is required.');
    }
    if (title.length > 160) {
        throw new Error('"title" is too long (max 160 characters).');
    }
    if (content.length > 12000) {
        throw new Error('"content" is too long (max 12000 characters).');
    }
    if (answer.length > 2000) {
        throw new Error('"answer" is too long (max 2000 characters).');
    }
    if (tags.length > 20) {
        throw new Error('"tags" supports up to 20 items.');
    }

    return { title, content, answer: answer || null, url, tags };
}

function generateSourceId(payload) {
    const seed = `${payload.title}|${payload.content}|${Date.now()}`;
    return `src_${crypto.createHash('sha1').update(seed, 'utf8').digest('hex').slice(0, 12)}`;
}

async function addKnowledgeSource(input = {}) {
    const validated = validateSource(input);
    const kb = await readKnowledgeBase();

    const source = {
        id: generateSourceId(validated),
        createdAt: new Date().toISOString(),
        title: validated.title,
        content: validated.content,
        answer: validated.answer,
        url: validated.url,
        tags: validated.tags,
    };

    kb.sources.push(source);
    await writeKnowledgeBase(kb);
    return source;
}

async function addKnowledgeSources(inputs = []) {
    if (!Array.isArray(inputs) || inputs.length === 0) {
        throw new Error('Field "sources" must be a non-empty array.');
    }

    const kb = await readKnowledgeBase();
    const created = [];

    for (const input of inputs) {
        const validated = validateSource(input);
        const source = {
            id: generateSourceId(validated),
            createdAt: new Date().toISOString(),
            title: validated.title,
            content: validated.content,
            answer: validated.answer,
            url: validated.url,
            tags: validated.tags,
        };
        kb.sources.push(source);
        created.push(source);
    }

    await writeKnowledgeBase(kb);
    return created;
}

async function listKnowledgeSources() {
    const kb = await readKnowledgeBase();
    return kb.sources;
}

async function searchKnowledge(query, options = {}) {
    const topK = Math.max(1, Math.min(Number(options.topK) || 3, 10));
    const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 0;

    const kb = await readKnowledgeBase();
    const results = kb.sources
        .map((source) => {
            const score = computeScore(query, source);
            return {
                id: source.id,
                score,
                title: source.title,
                url: source.url || null,
                answer: source.answer || makeSnippet(source.content, query),
                snippet: makeSnippet(source.content, query),
                tags: source.tags || [],
            };
        })
        .filter((item) => item.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    return results;
}

module.exports = {
    KNOWLEDGE_BASE_PATH,
    addKnowledgeSource,
    addKnowledgeSources,
    listKnowledgeSources,
    searchKnowledge,
};
