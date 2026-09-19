// server/sync/sync.routes.js
// API route per lo stato della sincronizzazione (dashboard)

const express = require('express');
const router = express.Router();
const { getSyncStatus } = require('./sync.service.js');

// GET /api/sync/status
// Ritorna lo stato aggiornato della sincronizzazione lsyncd per la dashboard
router.get('/status', (req, res) => {
  res.json(getSyncStatus());
});

module.exports = router;
