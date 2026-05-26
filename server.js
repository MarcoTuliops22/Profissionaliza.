require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const BLOCKED_STATIC = new Set([
    '.env',
    '.env.local',
    '.env.production',
    'server.js',
    'package.json',
    'package-lock.json'
]);

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 15;
const VISITOR_RATE_LIMIT_MAX = 30;
const requestCounts = new Map();
const VISITORS_FILE = path.join(__dirname, 'data', 'visitors.json');

function readVisitorCount() {
    try {
        if (fs.existsSync(VISITORS_FILE)) {
            const data = JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf8'));
            const count = Number(data?.count);
            return Number.isFinite(count) && count >= 0 ? count : 0;
        }
    } catch (error) {
        console.error('Erro ao ler contador de visitantes:', error.message);
    }
    return 0;
}

function writeVisitorCount(count) {
    fs.mkdirSync(path.dirname(VISITORS_FILE), { recursive: true });
    fs.writeFileSync(VISITORS_FILE, JSON.stringify({ count }, null, 2), 'utf8');
}

function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data:",
            "connect-src 'self'",
            "base-uri 'self'",
            "form-action 'self' https://wa.me",
            "frame-ancestors 'none'",
            "object-src 'none'"
        ].join('; ')
    );

    if (isProduction) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
}

function blockSensitiveFiles(req, res, next) {
    const requested = path.basename(decodeURIComponent(req.path)).toLowerCase();

    if (
        req.path.includes('..') ||
        req.path.includes('/node_modules') ||
        req.path.startsWith('/data') ||
        req.path.startsWith('/.') ||
        BLOCKED_STATIC.has(requested)
    ) {
        return res.status(404).end();
    }

    next();
}

function rateLimitApi(req, res, next) {
    const limits = {
        '/api/visitors': VISITOR_RATE_LIMIT_MAX
    };
    const maxRequests = limits[req.path];

    if (!maxRequests || req.method === 'GET') return next();

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    let record = requestCounts.get(key);

    if (!record || now - record.start > RATE_LIMIT_WINDOW_MS) {
        record = { start: now, count: 0 };
    }

    record.count += 1;
    requestCounts.set(key, record);

    if (record.count > maxRequests) {
        return res.status(429).json({
            success: false,
            error: 'Muitas requisições. Aguarde um momento e tente novamente.'
        });
    }

    next();
}

function sanitizeInput(value, maxLength = 2000) {
    if (typeof value !== 'string') return '';

    return value
        .trim()
        .slice(0, maxLength)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

app.use(securityHeaders);
app.use(blockSensitiveFiles);
app.use(rateLimitApi);

app.use(cors({
    origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(null, false);
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '10kb' }));

app.use(express.static(__dirname, {
    dotfiles: 'deny',
    index: 'index.html'
}));

app.get('/api/visitors', (req, res) => {
    res.json({ success: true, count: readVisitorCount() });
});

app.post('/api/visitors', (req, res) => {
    const count = readVisitorCount() + 1;
    writeVisitorCount(count);
    res.json({ success: true, count });
});

app.use((err, req, res, next) => {
    console.error('Erro no servidor:', err.message);
    res.status(500).json({ success: false, error: 'Erro interno do servidor.' });
});

app.listen(port, () => {
    console.log(`[Servidor] Operando em: http://localhost:${port}`);
});
