require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const ROOT = process.cwd();
const REPORT_FILE = path.join(ROOT, 'data', 'guardian-report.json');
const LOG_FILE = path.join(ROOT, 'data', 'guardian-log.json');
const INDEX_FILE = path.join(ROOT, 'index.html');
const STYLE_FILE = path.join(ROOT, 'style.css');
const MAX_LOG_ENTRIES = 50;
const HTML_SNIPPET_MAX = 12000;

function readJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error('[API:guardian] Falha ao ler JSON:', error.message);
  }
  return fallback;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function appendLog(entry) {
  const log = readJson(LOG_FILE, []);
  log.unshift({ ...entry, at: new Date().toISOString() });
  writeJson(LOG_FILE, log.slice(0, MAX_LOG_ENTRIES));
}

function sanitizeInput(value, maxLength = 400) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function collectHealthChecks() {
  const issues = [];
  const html = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf8') : '';
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const imgsWithoutAlt = imgTags.filter(tag => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)).length;
  const lazyCount = imgTags.filter(tag => /\blazy\s*=\s*["']lazy["']/i.test(tag)).length;
  const sections = (html.match(/<section\b/gi) || []).length;

  const title = titleMatch ? titleMatch[1].trim() : '';
  const description = descMatch ? descMatch[1].trim() : '';

  if (!title) issues.push({ level: 'high', code: 'missing-title', message: 'Página sem título (<title>).' });
  else if (title.length < 20) issues.push({ level: 'medium', code: 'short-title', message: 'Título curto para SEO.' });

  if (!description) issues.push({ level: 'high', code: 'missing-description', message: 'Meta description ausente.' });
  else if (description.length < 80) issues.push({ level: 'medium', code: 'short-description', message: 'Meta description curta.' });

  if (h1Count === 0) issues.push({ level: 'high', code: 'missing-h1', message: 'Nenhum H1 encontrado.' });
  if (h1Count > 1) issues.push({ level: 'medium', code: 'multiple-h1', message: `Múltiplos H1 (${h1Count}).` });
  if (imgsWithoutAlt > 0) issues.push({ level: 'medium', code: 'missing-alt', message: `${imgsWithoutAlt} imagem(ns) sem texto alternativo.` });
  if (sections < 3) issues.push({ level: 'low', code: 'few-sections', message: 'Poucas seções detectadas.' });

  const styleSize = fs.existsSync(STYLE_FILE) ? fs.statSync(STYLE_FILE).size : 0;
  return {
    issues,
    metrics: {
      titleLength: title.length,
      descriptionLength: description.length,
      h1Count,
      imageCount: imgTags.length,
      imagesWithoutAlt: imgsWithoutAlt,
      lazyImages: lazyCount,
      sectionCount: sections,
      htmlSizeKb: Math.round(html.length / 1024),
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
    summary: errorMessage ? `Auditoria local concluída. IA indisponível: ${errorMessage}` : 'Auditoria local concluída. Configure a chave Gemini para análises mais profundas.',
    score: Math.max(40, 100 - health.issues.filter(i => i.level === 'high').length * 15 - health.issues.filter(i => i.level === 'medium').length * 8),
    suggestions,
    health: health.issues,
    metrics: { ...health.metrics, visitors: visitorCount },
    aiPowered: false
  };
}

async function analyzeWithGemini(health, visitorCount) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chave GEMINI_API_KEY ausente.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    generationConfig: { temperature: 0.4 }
  });

  const prompt = `Analise o site Profissionaliza e sugira melhorias em SEO, conversão e segurança.\n${JSON.stringify({ issues: health.issues, metrics: health.metrics, visitors: visitorCount }, null, 2)}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const parsed = JSON.parse(text);
    return {
      generatedAt: new Date().toISOString(),
      summary: String(parsed.summary || 'Análise concluída.'),
      score: Math.min(100, Math.max(0, Number(parsed.score) || 70)),
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 8) : [],
      health: health.issues,
      metrics: { ...health.metrics, visitors: visitorCount },
      aiPowered: true
    };
  } catch {
    return buildFallbackReport(health, visitorCount, 'Resposta da IA inválida.');
  }
}

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.json(payload);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'GET') {
    const report = readJson(REPORT_FILE, null);
    return sendJson(res, 200, { success: true, report: report || null });
  }

  if (req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return sendJson(res, 415, { success: false, error: 'Content-Type deve ser application/json.' });
    }

    let body = {};
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch {
        body = {};
      }
    }

    const adminSecret = sanitizeInput(body.adminSecret || '', 200);
    if (!adminSecret || adminSecret !== sanitizeInput(process.env.ADMIN_SECRET || '', 200)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }

    const visitorCount = Number(body.visitorCount || 0);
    const reason = sanitizeInput(body.reason || 'manual', 100);
    const health = collectHealthChecks();

    try {
      const report = await analyzeWithGemini(health, visitorCount);
      writeJson(REPORT_FILE, report);
      appendLog({ action: 'analyze', reason, score: report.score, aiPowered: report.aiPowered });
      return sendJson(res, 200, { success: true, report });
    } catch (error) {
      const fallback = buildFallbackReport(health, visitorCount, error.message);
      writeJson(REPORT_FILE, fallback);
      appendLog({ action: 'analyze', reason, score: fallback.score, aiPowered: false, error: 'fallback' });
      return sendJson(res, 500, { success: false, error: 'Não foi possível concluir a análise no momento.', report: fallback });
    }
  }

  return sendJson(res, 405, { success: false, error: 'Método não permitido.' });
};
