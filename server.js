require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ─── Constantes de segurança ────────────────────────────────────────────────
const WHATSAPP_DOMAIN = 'https://wa.me';
const FONTS_GOOGLE = 'https://fonts.googleapis.com';
const FONTS_GSTATIC = 'https://fonts.gstatic.com';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

// Arquivos e diretórios que jamais devem ser servidos
const BLOCKED_EXTENSIONS = new Set(['.env', '.log', '.json', '.js', '.md', '.lock', '.sh', '.bat']);
const BLOCKED_FILENAMES = new Set([
    '.env', '.env.local', '.env.production', '.env.example',
    'server.js', 'site-guardian.js', 'package.json', 'package-lock.json',
    '.gitignore', '.git'
]);
const BLOCKED_PATH_SEGMENTS = [
    '/node_modules', '/data', '/.git', '/.env',
    '/server.js', '/site-guardian.js', '/package'
];

// ─── Visitors ───────────────────────────────────────────────────────────────
const VISITORS_FILE = path.join(__dirname, 'data', 'visitors.json');

function readVisitorCount() {
    try {
        if (fs.existsSync(VISITORS_FILE)) {
            const data = JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf8'));
            const count = Number(data?.count);
            return Number.isFinite(count) && count >= 0 ? count : 0;
        }
    } catch (err) {
        console.error('[Server] Erro ao ler visitantes:', err.message);
    }
    return 0;
}

function writeVisitorCount(count) {
    fs.mkdirSync(path.dirname(VISITORS_FILE), { recursive: true });
    fs.writeFileSync(VISITORS_FILE, JSON.stringify({ count }, null, 2), 'utf8');
}

// ─── Rate Limiting (sliding window + limpeza periódica) ─────────────────────
const rateLimitStore = new Map(); // key → { count, windowStart }

const RATE_CONFIGS = {
    global:   { windowMs: 60_000, max: 120 },   // 120 req/min por IP (geral)
    apiGet:   { windowMs: 60_000, max: 40  },   // 40 GET/min → /api/*
    apiPost:  { windowMs: 60_000, max: 10  },   // 10 POST/min → /api/*
};

// Limpa entradas expiradas a cada 5 minutos para evitar memory leak
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore) {
        const cfg = RATE_CONFIGS[record.type] || RATE_CONFIGS.global;
        if (now - record.windowStart > cfg.windowMs * 2) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60_000);

function checkRateLimit(key, configName) {
    const cfg = RATE_CONFIGS[configName] || RATE_CONFIGS.global;
    const now = Date.now();
    let record = rateLimitStore.get(key);

    if (!record || now - record.windowStart > cfg.windowMs) {
        record = { count: 0, windowStart: now, type: configName };
    }

    record.count++;
    rateLimitStore.set(key, record);

    const remaining = cfg.max - record.count;
    const reset = Math.ceil((record.windowStart + cfg.windowMs - now) / 1000);
    return { allowed: record.count <= cfg.max, remaining: Math.max(0, remaining), reset };
}

function rateLimit(configName) {
    return (req, res, next) => {
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
            .split(',')[0].trim();
        const key = `${configName}:${ip}`;
        const result = checkRateLimit(key, configName);

        res.setHeader('X-RateLimit-Limit', RATE_CONFIGS[configName]?.max || 120);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.reset);

        if (!result.allowed) {
            return res.status(429)
                .set('Retry-After', String(result.reset))
                .json({ success: false, error: 'Muitas requisições. Aguarde e tente novamente.' });
        }
        next();
    };
}

// ─── Sanitização de input ───────────────────────────────────────────────────
function sanitizeInput(value, maxLength = 2000) {
    if (typeof value !== 'string') return '';
    return value
        .trim()
        .slice(0, maxLength)
        // Remove caracteres de controle (exceto \t, \n, \r)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ─── Middleware: bloquear arquivos sensíveis ────────────────────────────────
function blockSensitiveFiles(req, res, next) {
    const rawPath = req.path;

    // Bloquear path traversal e codificações alternativas
    if (
        rawPath.includes('..') ||
        rawPath.includes('%2e') ||
        rawPath.includes('%2f') ||
        rawPath.includes('\0')
    ) {
        return res.status(400).end();
    }

    const decodedPath = (() => {
        try { return decodeURIComponent(rawPath).toLowerCase(); }
        catch { return rawPath.toLowerCase(); }
    })();

    // Bloquear segmentos de path proibidos
    if (BLOCKED_PATH_SEGMENTS.some(seg => decodedPath.startsWith(seg) || decodedPath.includes(seg))) {
        return res.status(404).end();
    }

    // Bloquear por nome de arquivo
    const basename = path.basename(decodedPath);
    if (BLOCKED_FILENAMES.has(basename)) {
        return res.status(404).end();
    }

    // Bloquear extensões sensíveis fora da pasta /assets
    const ext = path.extname(decodedPath);
    if (BLOCKED_EXTENSIONS.has(ext) && !decodedPath.startsWith('/assets/')) {
        return res.status(404).end();
    }

    next();
}

// ─── Middleware: validar Content-Type em POST ───────────────────────────────
function requireJson(req, res, next) {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('application/json')) {
        return res.status(415).json({ success: false, error: 'Content-Type deve ser application/json.' });
    }
    next();
}

// ─── Middleware: headers de cache seguros para API ──────────────────────────
function noCacheHeaders(req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
}

// ─── Helmet (15+ headers de segurança) ─────────────────────────────────────
app.disable('x-powered-by');
app.use(helmet({
    // Content-Security-Policy customizada abaixo (helmet.contentSecurityPolicy separado)
    contentSecurityPolicy: false,
    // Cross-Origin-Opener-Policy
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    // Cross-Origin-Resource-Policy
    crossOriginResourcePolicy: { policy: 'same-origin' },
    // Cross-Origin-Embedder-Policy (não bloqueia Fonts)
    crossOriginEmbedderPolicy: false,
    // X-Content-Type-Options: nosniff
    noSniff: true,
    // X-Frame-Options: DENY
    frameguard: { action: 'deny' },
    // X-DNS-Prefetch-Control
    dnsPrefetchControl: { allow: false },
    // X-Download-Options (IE)
    ieNoOpen: true,
    // X-Permitted-Cross-Domain-Policies
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    // Referrer-Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // X-XSS-Protection (legado mas ainda útil)
    xssFilter: true,
    // HSTS
    hsts: isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    // Ocultar X-Powered-By
    hidePoweredBy: true,
}));

// CSP detalhado e restrito
app.use(helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
        defaultSrc:       ["'self'"],
        scriptSrc:        ["'self'"],
        styleSrc:         ["'self'", FONTS_GOOGLE, "'unsafe-inline'"],
        fontSrc:          ["'self'", FONTS_GSTATIC],
        imgSrc:           ["'self'"],
        connectSrc:       ["'self'"],
        formAction:       ["'self'", WHATSAPP_DOMAIN],
        frameAncestors:   ["'none'"],
        objectSrc:        ["'none'"],
        baseUri:          ["'self'"],
        upgradeInsecureRequests: isProduction ? [] : null,
        blockAllMixedContent: isProduction ? [] : null,
    },
    reportOnly: false,
}));

// Permissions-Policy (não coberto pelo helmet padrão)
app.use((req, res, next) => {
    res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=()'
    );
    next();
});

// ─── CORS restrito ──────────────────────────────────────────────────────────
app.use(cors({
    origin(origin, callback) {
        // Permitir requests sem origin (ex: Postman local, curl)
        if (!origin) { callback(null, true); return; }
        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            // Retorna erro explícito — não apenas silencioso
            callback(new Error(`CORS: origem não permitida — ${origin}`));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    optionsSuccessStatus: 200,
}));

// ─── Body parser com limite restrito ───────────────────────────────────────
app.use(express.json({ limit: '10kb', strict: true }));

// ─── Proteções globais ──────────────────────────────────────────────────────
app.use(blockSensitiveFiles);
app.use(rateLimit('global')); // Rate limit global em todos os requests

// ─── Assets estáticos com headers de cache seguros ─────────────────────────
app.use(express.static(__dirname, {
    dotfiles: 'deny',
    index: 'index.html',
    setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        // Recursos de conteúdo (HTML, CSS, JS): sem cache agressivo
        if (['.html', '.css', '.js'].includes(ext)) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        }
        // Assets imutáveis (imagens): cache longo
        else if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff2'].includes(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        }
        // Tudo mais: sem cache
        else {
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));

// ─── API Routes ─────────────────────────────────────────────────────────────
app.get('/api/visitors',
    rateLimit('apiGet'),
    noCacheHeaders,
    (req, res) => {
        res.json({ success: true, count: readVisitorCount() });
    }
);

app.post('/api/visitors',
    rateLimit('apiPost'),
    requireJson,
    noCacheHeaders,
    (req, res) => {
        const count = readVisitorCount() + 1;
        writeVisitorCount(count);
        res.json({ success: true, count });
    }
);

// ─── 404 handler ───────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Recurso não encontrado.' });
});

// ─── Error handler global ──────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    // Não vazar detalhes do erro em produção
    const message = isProduction ? 'Erro interno do servidor.' : err.message;

    if (err.message?.startsWith('CORS:')) {
        return res.status(403).json({ success: false, error: 'Origem não autorizada.' });
    }

    console.error('[Server] Erro:', err.message);
    res.status(err.status || 500).json({ success: false, error: message });
});

// ─── Start ──────────────────────────────────────────────────────────────────
app.listen(port, '127.0.0.1', () => {
    console.log(`[Server] Rodando em http://localhost:${port} | Produção: ${isProduction}`);
});
