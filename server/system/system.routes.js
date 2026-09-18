// server/system/system.routes.js
// API endpoints per il monitoraggio S.M.A.R.T. e lo stato del sistema.

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger.js');
const { requireAuth } = require('../auth/auth.middleware.js');
const { triggerAlert, resolveAlert, getAlertState } = require('./smart.service.js');

// ─────────────────────────────────────────────
// Middleware: solo admin
// ─────────────────────────────────────────────
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accesso riservato agli amministratori.' });
    }
    next();
}

// ─────────────────────────────────────────────
// POST /api/system/disk-alert
// Webhook ricevuto da smartd via script shell.
// Accettato SOLO da localhost (127.0.0.1) per sicurezza.
// ─────────────────────────────────────────────
router.post('/disk-alert', async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || '';
    const isLocalhost = clientIp === '127.0.0.1' ||
                        clientIp === '::1' ||
                        clientIp === '::ffff:127.0.0.1';

    if (!isLocalhost) {
        logger.warn(`[S.M.A.R.T.] Tentativo di chiamata webhook da IP non autorizzato: ${clientIp}`);
        return res.status(403).json({ error: 'Accesso non autorizzato.' });
    }

    const { disk, message } = req.body;

    if (!disk || !message) {
        return res.status(400).json({ error: 'Parametri "disk" e "message" richiesti.' });
    }

    logger.warn(`[S.M.A.R.T.] Webhook di allerta ricevuto: disco=${disk}, messaggio=${message}`);
    await triggerAlert(disk, message);

    res.json({ success: true, message: 'Allerta registrata.' });
});

// ─────────────────────────────────────────────
// GET /api/system/disk-status
// Ritorna lo stato attuale dell'allerta (solo admin)
// ─────────────────────────────────────────────
router.get('/disk-status', requireAuth, requireAdmin, (req, res) => {
    const state = getAlertState();
    res.json(state);
});

// ─────────────────────────────────────────────
// POST /api/system/disk-resolve
// Marca l'allerta come risolta (solo admin)
// ─────────────────────────────────────────────
router.post('/disk-resolve', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await resolveAlert(req.user.username);
        if (!result.success) {
            return res.status(400).json({ error: result.message });
        }
        res.json({ success: true, message: 'Allerta marcata come risolta.' });
    } catch (err) {
        logger.error(`[S.M.A.R.T.] Errore nella risoluzione dell'allerta: ${err.message}`);
        res.status(500).json({ error: 'Errore interno del server.' });
    }
});

module.exports = router;
