require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
const requestCounts = new Map();

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
        req.path.startsWith('/.') ||
        BLOCKED_STATIC.has(requested)
    ) {
        return res.status(404).end();
    }

    next();
}

function rateLimitApi(req, res, next) {
    if (req.path !== '/api/generate') return next();

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = requestCounts.get(ip);

    if (!record || now - record.start > RATE_LIMIT_WINDOW_MS) {
        record = { start: now, count: 0 };
    }

    record.count += 1;
    requestCounts.set(ip, record);

    if (record.count > RATE_LIMIT_MAX) {
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

let genAI = null;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

app.post('/api/generate', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({
            success: false,
            error: 'Serviço de IA indisponível no momento.'
        });
    }

    try {
        const orderType = sanitizeInput(req.body?.orderType, 120);
        const orderDetails = sanitizeInput(req.body?.orderDetails, 2000);

        if (!orderType || !orderDetails) {
            return res.status(400).json({
                success: false,
                error: 'Informe o tipo de serviço e os detalhes do pedido.'
            });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        const prompt = `Você é um desenvolvedor de software/designer experiente trabalhando em uma fábrica de templates rápidos.
O cliente solicitou um projeto do tipo: "${orderType}".
Os detalhes solicitados pelo cliente foram: "${orderDetails}".

Instruções:
- Se o projeto for um "Site", gere o código HTML e CSS completo, moderno, em um único arquivo, pronto para uso.
- Se for um "Currículo", crie um template limpo e estiloso (preferencialmente já usando HTML simples ou Markdown estruturado).
- Se for uma "Planilha", entregue o conteúdo formatado como um arquivo CSV delimitado por vírgulas válido.
Responda APENAS com o código, sem textos introdutórios ou de ajuda do tipo 'Aqui está o seu site'. Remova marcações de blocos de código (ex: \`\`\`html) do retorno para que o código vá limpo.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const textCodeOutput = response.text();

        let filename = 'template.txt';
        let mimeType = 'text/plain';

        const normalizedType = orderType.toLowerCase();
        if (normalizedType.includes('site')) {
            filename = 'website-personalizado.html';
            mimeType = 'text/html';
        } else if (normalizedType.includes('currículo') || normalizedType.includes('curriculo')) {
            filename = 'curriculo.html';
            mimeType = 'text/html';
        } else if (normalizedType.includes('planilha') || normalizedType.includes('financeiro')) {
            filename = 'controle-financeiro.csv';
            mimeType = 'text/csv';
        }

        res.json({
            success: true,
            filename,
            mimeType,
            content: textCodeOutput
        });
    } catch (error) {
        console.error('Erro ao invocar o Gemini:', error.message);
        res.status(500).json({
            success: false,
            error: isProduction ? 'Falha na geração do template.' : 'Falha na geração do template pela IA.'
        });
    }
});

app.use((err, req, res, next) => {
    console.error('Erro no servidor:', err.message);
    res.status(500).json({ success: false, error: 'Erro interno do servidor.' });
});

app.listen(port, () => {
    console.log(`[Servidor] Operando em: http://localhost:${port}`);
    if (!process.env.GEMINI_API_KEY) {
        console.warn('[Aviso] GEMINI_API_KEY não configurada — rota /api/generate desabilitada.');
    }
});
