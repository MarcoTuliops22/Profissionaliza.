require('dotenv').config();
const fs = require('fs');
const path = require('path');

const VISITORS_FILE = path.join(process.cwd(), 'data', 'visitors.json');

function sanitizeInput(value, maxLength = 1000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function readVisitorCount() {
  try {
    if (fs.existsSync(VISITORS_FILE)) {
      const data = JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf8'));
      const count = Number(data?.count);
      return Number.isFinite(count) && count >= 0 ? count : 0;
    }
  } catch (error) {
    console.error('[API:visitors] Falha ao ler contador:', error.message);
  }
  return 0;
}

function writeVisitorCount(count) {
  fs.mkdirSync(path.dirname(VISITORS_FILE), { recursive: true });
  fs.writeFileSync(VISITORS_FILE, JSON.stringify({ count }, null, 2), 'utf8');
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

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'GET') {
    return sendJson(res, 200, { success: true, count: readVisitorCount() });
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

    const reason = sanitizeInput(body.reason, 250);
    const count = readVisitorCount() + 1;
    writeVisitorCount(count);

    return sendJson(res, 200, {
      success: true,
      count,
      reason: reason || 'visit-recorded'
    });
  }

  return sendJson(res, 405, { success: false, error: 'Método não permitido.' });
};
