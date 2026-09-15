const https = require('https');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

// Load config first (initializes env, creates directories, generates JWT secret)
const config = require('./config.js');
const logger = require('./utils/logger.js');
const { getHttpsCredentials } = require('./security/https.js');
const { globalLimiter, authLimiter, uploadLimiter } = require('./security/rate-limiter.js');
const authRoutes = require('./auth/auth.routes.js');
const webauthnRoutes = require('./auth/webauthn.routes.js');
const filesRoutes = require('./files/files.routes.js');
const { startWebDAVServer } = require('./webdav/webdav.server.js');
const { startSync, getSyncStatus } = require('./sync/sync.service.js');

// ─── Express App Setup ──────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // Indispensabile per Cloudflare Tunnel e Rate Limiting

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
        }
    }
}));
app.use(cors({ origin: true, credentials: true }));
app.options('*', cors({ origin: true, credentials: true })); // Gestisce i preflight OPTIONS (fondamentale per TUS)
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global rate limiter
app.use(globalLimiter);

// ─── Static Files (Frontend) ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API Routes ─────────────────────────────────────────────────────────────

// Auth routes with stricter rate limiting on login
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/setup', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/auth/webauthn', webauthnRoutes);

// File routes with upload rate limiting
app.use('/api/files/upload', uploadLimiter);
app.use('/api/files', filesRoutes);

// TUS Protocol routes for chunked uploads
const { requireAuth } = require('./auth/auth.middleware.js');
const tusServer = require('./files/tus.service.js');
app.all('/api/tus/*', requireAuth, tusServer.handle.bind(tusServer));
app.all('/api/tus', requireAuth, tusServer.handle.bind(tusServer));

// Sync status endpoint
app.get('/api/sync/status', (req, res) => {
    res.json(getSyncStatus());
});

// ─── SPA Fallback ───────────────────────────────────────────────────────────
// Serve index.html for any non-API route (SPA-style navigation)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
});

// ─── Error Handling ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    logger.error(`Errore non gestito: ${err.message}`, { stack: err.stack });
    
    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
            error: 'Il file supera la dimensione massima consentita.' 
        });
    }
    
    res.status(500).json({ error: 'Errore interno del server.' });
});

// ─── Start Server ───────────────────────────────────────────────────────────
async function start() {
    try {
        // Generate/load HTTPS certificates
        const credentials = getHttpsCredentials();
        
        // Start HTTPS server
        const httpsServer = https.createServer(credentials, app);
        
        // Disable timeouts for large file uploads
        httpsServer.timeout = 0;
        httpsServer.requestTimeout = 0;
        httpsServer.keepAliveTimeout = 0;
        
        httpsServer.listen(config.httpsPort, '0.0.0.0', () => {
            logger.info('═══════════════════════════════════════════════════');
            logger.info('  ☁️  Dischi Cloud — Il tuo cloud personale sicuro');
            logger.info('═══════════════════════════════════════════════════');
            logger.info(`  🌐 Web UI:     https://localhost:${config.httpsPort}`);
            logger.info(`  📁 Disco:      ${config.primaryDisk}`);
            logger.info(`  💾 Backup:     ${config.backupDisk}`);
            logger.info(`  🔄 Sync:       ${config.syncEnabled ? 'Attivo' : 'Disattivato'}`);
            logger.info('═══════════════════════════════════════════════════');
        });

        // Start WebDAV server
        try {
            await startWebDAVServer();
            logger.info(`  📂 WebDAV:     https://localhost:${config.webdavPort}`);
        } catch (err) {
            logger.error(`Errore avvio WebDAV: ${err.message}`);
        }

        // Start sync engine
        if (config.syncEnabled) {
            try {
                await startSync();
            } catch (err) {
                logger.error(`Errore avvio sync: ${err.message}`);
            }
        }

        // Graceful shutdown
        const shutdown = (signal) => {
            logger.info(`\n${signal} ricevuto. Chiusura in corso...`);
            httpsServer.close(() => {
                logger.info('Server HTTPS chiuso.');
                process.exit(0);
            });
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

    } catch (err) {
        logger.error(`Errore fatale all'avvio: ${err.message}`, { stack: err.stack });
        process.exit(1);
    }
}

start();
