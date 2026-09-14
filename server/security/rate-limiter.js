const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 300,
    message: { error: 'Troppe richieste da questo IP, riprova più tardi.' },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for static assets and auth status checks
    skip: (req) => {
        return req.path === '/api/auth/status' || 
               req.path === '/api/auth/refresh' ||
               !req.path.startsWith('/api/');
    }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: 5,
    message: { error: 'Troppi tentativi di accesso, riprova tra 15 minuti.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 20,
    message: { error: 'Troppi caricamenti in corso, riprova tra poco.' },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    globalLimiter,
    authLimiter,
    uploadLimiter
};
