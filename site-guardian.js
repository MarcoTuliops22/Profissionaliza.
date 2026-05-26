const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, 'index.html');
const STYLE_FILE = path.join(ROOT, 'style.css');
const REPORT_FILE = path.join(ROOT, 'data', 'guardian-report.json');
const LOG_FILE = path.join(ROOT, 'data', 'guardian-log.json');
const MAX_LOG_ENTRIES = 50;
const HTML_SNIPPET_MAX = 12000;

let isRunning = false;

function readJson(filePath, fallback) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        console.error(`[Guardião] Erro ao ler ${filePath}:`, error.message);
    }
    return fallback;
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function appendLog(entry) {
    const log = readJson(LOG_FILE, []);
    log.unshift({
        ...entry,
        at: new Date().toISOString()
    });
    writeJson(LOG_FILE, log.slice(0, MAX_LOG_ENTRIES));
}

function collectHealthChecks() {
    const issues = [];
    const html = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf8') : '';

    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    const h1Count = (html.match(/<h1\b/gi) || []).length;
    const imgTags = html.match(/<img\b[^>]*>/gi) || [];
    const imgsWithoutAlt = imgTags.filter(tag => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)).length;
    const lazyCount = imgTags.filter(tag => /\bloading\s*=\s*["']lazy["']/i.test(tag)).length;
    const internalLinks = (html.match(/href\s*=\s*["']#[^"']+["']/gi) || []).length;
    const sections = (html.match(/<section\b/gi) || []).length;

    const title = titleMatch ? titleMatch[1].trim() : '';
    const description = descMatch ? descMatch[1].trim() : '';

    if (!title) issues.push({ level: 'high', code: 'missing-title', message: 'Página sem título (<title>).' });
    else if (title.length < 20) issues.push({ level: 'medium', code: 'short-title', message: 'Título curto para SEO.' });

    if (!description) issues.push({ level: 'high', code: 'missing-description', message: 'Meta description ausente.' });
    else if (description.length < 80) issues.push({ level: 'medium', code: 'short-description', message: 'Meta description curta.' });
    else if (description.length > 165) issues.push({ level: 'low', code: 'long-description', message: 'Meta description longa (pode ser cortada no Google).' });

    if (h1Count === 0) issues.push({ level: 'high', code: 'missing-h1', message: 'Nenhum H1 encontrado.' });
    if (h1Count > 1) issues.push({ level: 'medium', code: 'multiple-h1', message: `Múltiplos H1 (${h1Count}).` });

    if (imgsWithoutAlt > 0) {
        issues.push({
            level: 'medium',
            code: 'missing-alt',
            message: `${imgsWithoutAlt} imagem(ns) sem texto alternativo (alt).`
        });
    }

    if (imgTags.length > 3 && lazyCount < imgTags.length - 1) {
        issues.push({
            level: 'low',
            code: 'lazy-loading',
            message: 'Algumas imagens podem usar loading="lazy" para performance.'
        });
    }

    if (sections < 3) {
        issues.push({ level: 'low', code: 'few-sections', message: 'Poucas seções detectadas — revisar estrutura.' });
    }

    const styleSize = fs.existsSync(STYLE_FILE) ? fs.statSync(STYLE_FILE).size : 0;
    const htmlSize = html.length;

    return {
        issues,
        metrics: {
            titleLength: title.length,
            descriptionLength: description.length,
            h1Count,
            imageCount: imgTags.length,
            imagesWithoutAlt: imgsWithoutAlt,
            lazyImages: lazyCount,
            internalAnchorLinks: internalLinks,
            sectionCount: sections,
            htmlSizeKb: Math.round(htmlSize / 1024),
            cssSizeKb: Math.round(styleSize / 1024)
        },
        snippets: {
            title,
            description,
            htmlHead: html.slice(0, 2500),
            htmlSample: html.slice(2500, 2500 + HTML_SNIPPET_MAX)
        }
    };
}

function extractJsonFromText(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;

    try {
        return JSON.parse(candidate);
    } catch {
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(candidate.slice(start, end + 1));
        }
        throw new Error('Resposta da IA não está em JSON válido.');
    }
}

function normalizeSuggestions(rawSuggestions) {
    if (!Array.isArray(rawSuggestions)) return [];

    return rawSuggestions
        .map((item, index) => {
            const id = String(item.id || `suggestion-${index + 1}`).slice(0, 40);
            const patch = item.patch && typeof item.patch === 'object' ? item.patch : null;
            const patchType = patch?.type ? String(patch.type) : null;
            const autoApplicable = Boolean(
                item.autoApplicable &&
                patchType &&
                ['meta-description', 'title'].includes(patchType) &&
                typeof patch.value === 'string' &&
                patch.value.trim()
            );

            return {
                id,
                priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
                category: String(item.category || 'geral').slice(0, 40),
                title: String(item.title || 'Sugestão').slice(0, 120),
                description: String(item.description || '').slice(0, 800),
                autoApplicable,
                applied: false,
                patch: autoApplicable
                    ? { type: patchType, value: patch.value.trim().slice(0, 300) }
                    : null
            };
        })
        .slice(0, 12);
}

function buildFallbackReport(health, visitorCount, errorMessage) {
    const suggestions = health.issues.map((issue, index) => ({
        id: `health-${issue.code}-${index}`,
        priority: issue.level,
        category: 'auditoria',
        title: issue.message,
        description: 'Detectado automaticamente pela auditoria local do Guardião.',
        autoApplicable: false,
        applied: false,
        patch: null
    }));

    return {
        generatedAt: new Date().toISOString(),
        summary: errorMessage
            ? `Auditoria local concluída. IA indisponível: ${errorMessage}`
            : 'Auditoria local concluída. Configure GEMINI_API_KEY para análises mais profundas.',
        score: Math.max(40, 100 - health.issues.filter(i => i.level === 'high').length * 15 - health.issues.filter(i => i.level === 'medium').length * 8),
        suggestions,
        health: health.issues,
        metrics: { ...health.metrics, visitors: visitorCount },
        aiPowered: false
    };
}

async function analyzeWithGemini(genAI, health, visitorCount) {
    const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        generationConfig: { temperature: 0.4 }
    });

    const prompt = `Você é o Guardião IA do site "Profissionaliza TI" (serviços de informática no Brasil).
Analise os dados e sugira melhorias práticas de SEO, conversão (WhatsApp/orçamento), UX mobile e clareza comercial.

DADOS DA AUDITORIA:
${JSON.stringify({
    issues: health.issues,
    metrics: health.metrics,
    visitors: visitorCount,
    title: health.snippets.title,
    description: health.snippets.description
}, null, 2)}

AMOSTRA HTML (parcial):
${health.snippets.htmlHead}
...
${health.snippets.htmlSample.slice(0, 6000)}

Responda APENAS com JSON válido neste formato:
{
  "summary": "resumo em 2 frases em português",
  "score": 0-100,
  "suggestions": [
    {
      "id": "slug-unico",
      "priority": "high|medium|low",
      "category": "seo|ux|conversao|performance|conteudo",
      "title": "título curto",
      "description": "o que fazer e por quê",
      "autoApplicable": true ou false,
      "patch": { "type": "meta-description|title", "value": "novo texto" } ou null
    }
  ]
}

Regras:
- Máximo 8 sugestões, priorize impacto em vendas de serviços de TI.
- Só marque autoApplicable true se patch for meta-description ou title com valor pronto.
- Não invente dados de visitantes além do informado.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = extractJsonFromText(text);

    return {
        generatedAt: new Date().toISOString(),
        summary: String(parsed.summary || 'Análise concluída.').slice(0, 500),
        score: Math.min(100, Math.max(0, Number(parsed.score) || 70)),
        suggestions: normalizeSuggestions(parsed.suggestions),
        health: health.issues,
        metrics: { ...health.metrics, visitors: visitorCount },
        aiPowered: true
    };
}

function applyPatchToHtml(html, patch) {
    if (patch.type === 'meta-description') {
        const safe = patch.value.replace(/"/g, '&quot;');
        if (/<meta\s+name=["']description["']/i.test(html)) {
            return html.replace(
                /(<meta\s+name=["']description["']\s+content=["'])([^"']*)(["'])/i,
                `$1${safe}$3`
            );
        }
        return html.replace(
            /(<meta\s+charset=["'][^"']*["']\s*>)/i,
            `$1\n    <meta name="description" content="${safe}">`
        );
    }

    if (patch.type === 'title') {
        const safe = patch.value.replace(/</g, '').replace(/>/g, '');
        if (/<title>[^<]*<\/title>/i.test(html)) {
            return html.replace(/<title>[^<]*<\/title>/i, `<title>${safe}</title>`);
        }
    }

    throw new Error('Tipo de correção não suportado.');
}

function applySuggestion(suggestionId) {
    const report = readJson(REPORT_FILE, null);
    if (!report) {
        throw new Error('Nenhum relatório disponível. Execute uma análise primeiro.');
    }

    const suggestion = report.suggestions.find(s => s.id === suggestionId);
    if (!suggestion) throw new Error('Sugestão não encontrada.');
    if (suggestion.applied) throw new Error('Esta sugestão já foi aplicada.');
    if (!suggestion.autoApplicable || !suggestion.patch) {
        throw new Error('Esta sugestão precisa ser aplicada manualmente no código.');
    }

    const html = fs.readFileSync(INDEX_FILE, 'utf8');
    const updated = applyPatchToHtml(html, suggestion.patch);
    fs.writeFileSync(INDEX_FILE, updated, 'utf8');

    suggestion.applied = true;
    suggestion.appliedAt = new Date().toISOString();
    writeJson(REPORT_FILE, report);

    appendLog({
        action: 'apply',
        suggestionId,
        title: suggestion.title
    });

    return { report, applied: suggestion };
}

async function runAnalysis({ genAI, visitorCount = 0, reason = 'manual' }) {
    if (isRunning) {
        throw new Error('Análise já em andamento. Aguarde a conclusão.');
    }

    isRunning = true;
    const startedAt = Date.now();

    try {
        const health = collectHealthChecks();
        let report;

        if (genAI) {
            try {
                report = await analyzeWithGemini(genAI, health, visitorCount);
            } catch (error) {
                console.error('[Guardião] Falha na IA:', error.message);
                report = buildFallbackReport(health, visitorCount, error.message);
            }
        } else {
            report = buildFallbackReport(health, visitorCount, 'GEMINI_API_KEY não configurada');
        }

        const previous = readJson(REPORT_FILE, null);
        if (previous?.suggestions?.length) {
            const appliedMap = new Map(
                previous.suggestions.filter(s => s.applied).map(s => [s.id, s.appliedAt])
            );
            report.suggestions = report.suggestions.map(s => {
                if (appliedMap.has(s.id)) {
                    return { ...s, applied: true, appliedAt: appliedMap.get(s.id) };
                }
                return s;
            });
        }

        report.reason = reason;
        report.durationMs = Date.now() - startedAt;
        writeJson(REPORT_FILE, report);

        appendLog({
            action: 'analyze',
            reason,
            score: report.score,
            suggestionCount: report.suggestions.length,
            aiPowered: report.aiPowered
        });

        return report;
    } finally {
        isRunning = false;
    }
}

async function runAutoImprovements(report) {
    if (process.env.GUARDIAN_AUTO_APPLY !== 'true') {
        return { applied: [], skipped: report.suggestions.length };
    }

    const applied = [];
    for (const suggestion of report.suggestions) {
        if (!suggestion.autoApplicable || suggestion.applied) continue;
        try {
            applySuggestion(suggestion.id);
            applied.push(suggestion.id);
        } catch (error) {
            console.warn(`[Guardião] Não aplicou ${suggestion.id}:`, error.message);
        }
    }

    return { applied, skipped: report.suggestions.length - applied.length };
}

function getStatus() {
    const report = readJson(REPORT_FILE, null);
    const log = readJson(LOG_FILE, []);

    return {
        enabled: true,
        isRunning,
        autoApply: process.env.GUARDIAN_AUTO_APPLY === 'true',
        lastRun: report?.generatedAt || null,
        lastScore: report?.score ?? null,
        suggestionCount: report?.suggestions?.length ?? 0,
        pendingAuto: report?.suggestions?.filter(s => s.autoApplicable && !s.applied).length ?? 0,
        aiPowered: report?.aiPowered ?? false,
        recentLog: log.slice(0, 8)
    };
}

function getReport() {
    return readJson(REPORT_FILE, null);
}

function getLog() {
    return readJson(LOG_FILE, []);
}

function scheduleGuardian({ genAI, getVisitorCount, intervalHours = 24 }) {
    const hours = Number(intervalHours) || 24;
    const ms = Math.max(1, hours) * 60 * 60 * 1000;

    const tick = async (reason) => {
        try {
            const visitorCount = typeof getVisitorCount === 'function' ? getVisitorCount() : 0;
            const report = await runAnalysis({ genAI, visitorCount, reason });
            const auto = await runAutoImprovements(report);
            if (auto.applied.length) {
                console.log(`[Guardião] Melhorias automáticas aplicadas: ${auto.applied.join(', ')}`);
            }
            console.log(`[Guardião] Análise concluída (score ${report.score}). Motivo: ${reason}`);
        } catch (error) {
            console.error('[Guardião] Erro na análise agendada:', error.message);
        }
    };

    setTimeout(() => tick('startup'), 45 * 1000);
    setInterval(() => tick('scheduled'), ms);

    console.log(`[Guardião] Monitoramento ativo — análise a cada ${hours}h`);
}

module.exports = {
    runAnalysis,
    applySuggestion,
    runAutoImprovements,
    getStatus,
    getReport,
    getLog,
    scheduleGuardian,
    REPORT_FILE
};
