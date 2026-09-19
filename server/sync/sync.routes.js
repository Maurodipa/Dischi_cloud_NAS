// server/sync/sync.routes.js
// API routes per lo stato della sincronizzazione e webhook da lsyncd

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger.js');
const { getSyncStatus, handleWebhook } = require('./sync.service.js');

// ─────────────────────────────────────────────
// GET /api/sync/status
// Ritorna lo stato attuale della sincronizzazione (per la dashboard)
// ─────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json(getSyncStatus());
});

// ─────────────────────────────────────────────
// POST /api/sync/webhook
// Webhook da lsyncd (chiamato tramite sync-webhook.sh)
// Accettato SOLO da localhost (127.0.0.1)
// ─────────────────────────────────────────────
router.post('/webhook', (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || '';
  const isLocalhost = clientIp === '127.0.0.1' ||
                      clientIp === '::1' ||
                      clientIp === '::ffff:127.0.0.1';

  if (!isLocalhost) {
    logger.warn(`[Sync-lsyncd] Webhook rifiutato da IP non autorizzato: ${clientIp}`);
    return res.status(403).json({ error: 'Accesso non autorizzato.' });
  }

  const { status, exitcode } = req.body;
  handleWebhook(status, exitcode);

  res.json({ success: true, message: 'Webhook di sincronizzazione registrato.' });
});

module.exports = router;
