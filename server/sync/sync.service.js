// server/sync/sync.service.js
// Servizio di monitoraggio sincronizzazione integrato con lsyncd (demone di sistema)

const fse = require('fs-extra');
const path = require('path');
const config = require('../config.js');
const logger = require('../utils/logger.js');

const LSYNCD_LOG_FILE = '/var/log/lsyncd/lsyncd.log';

const syncStats = {
  totalSynced: 0,
  lastSyncTime: null,
  errors: 0,
  isHealthy: true,
  mode: 'lsyncd'
};

// ─────────────────────────────────────────────
// Gestione Webhook (chiamato da lsyncd via sync-webhook.sh)
// ─────────────────────────────────────────────

function handleWebhook(status, exitcode) {
  const code = parseInt(exitcode, 10) || 0;

  if (status === 'completed' && code === 0) {
    syncStats.totalSynced++;
    syncStats.lastSyncTime = new Date().toISOString();
    syncStats.isHealthy = true;
    logger.info('[Sync-lsyncd] Sincronizzazione completata con successo via webhook.');
  } else if (status === 'error' || code !== 0) {
    syncStats.errors++;
    syncStats.isHealthy = false;
    logger.error(`[Sync-lsyncd] Errore di sincronizzazione segnalato via webhook (exitcode ${code}).`);
  }
}

// ─────────────────────────────────────────────
// Lettura del Log di lsyncd (all'avvio e alle 04:00 AM)
// ─────────────────────────────────────────────

async function readLsyncdLog() {
  try {
    if (!await fse.pathExists(LSYNCD_LOG_FILE)) {
      logger.warn(`[Sync-lsyncd] File log non trovato (${LSYNCD_LOG_FILE}). lsyncd potrebbe non essere attivo.`);
      return;
    }

    const content = await fse.readFile(LSYNCD_LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const lastLines = lines.slice(-50); // Ultimi 50 eventi

    let hasRecentError = false;
    let lastSuccessTime = null;

    for (const line of lastLines) {
      if (line.includes('Normal: Executing rsync') || line.includes('Normal: Finished rsync')) {
        // Estrai ipotetico timestamp
        const match = line.match(/^(\w{3} \w{3}\s+\d+\s+\d+:\d+:\d+\s+\d{4})/);
        if (match) {
          lastSuccessTime = new Date(match[1]).toISOString();
        }
      }
      if (line.includes('Error:') || line.includes('FAIL')) {
        hasRecentError = true;
      }
    }

    if (lastSuccessTime) {
      syncStats.lastSyncTime = lastSuccessTime;
    }

    if (hasRecentError) {
      syncStats.isHealthy = false;
      logger.warn('[Sync-lsyncd] Sanity check: rilevati errori nel log di lsyncd.');
    } else {
      syncStats.isHealthy = true;
      logger.info('[Sync-lsyncd] Sanity check: lo stato di lsyncd risulta regolare.');
    }

  } catch (err) {
    logger.error(`[Sync-lsyncd] Impossibile leggere il log di lsyncd: ${err.message}`);
  }
}

// ─────────────────────────────────────────────
// Pianificazione Sanity Check notturno (04:00 AM)
// ─────────────────────────────────────────────

function scheduleDailySanityCheck() {
  const now = new Date();
  const next4am = new Date(now);
  next4am.setHours(4, 0, 0, 0);
  if (next4am <= now) next4am.setDate(next4am.getDate() + 1);

  const msUntil4am = next4am - now;
  logger.info(`[Sync-lsyncd] Prossimo sanity check del log lsyncd: ${next4am.toLocaleString('it-IT')}`);

  setTimeout(() => {
    readLsyncdLog();
    setInterval(readLsyncdLog, 24 * 60 * 60 * 1000);
  }, msUntil4am);
}

// ─────────────────────────────────────────────
// Inizializzazione del Servizio
// ─────────────────────────────────────────────

async function startSync() {
  if (!config.syncEnabled) {
    logger.info('[Sync-lsyncd] Sincronizzazione disattivata nelle impostazioni (.env).');
    return;
  }

  logger.info('[Sync-lsyncd] Avvio servizio di monitoraggio lsyncd...');

  // Assicurati che le directory esistano
  await fse.ensureDir(config.primaryDisk);
  await fse.ensureDir(config.backupDisk);

  // Leggi il log all'avvio per ricostruire l'ultimo stato noto
  await readLsyncdLog();

  // Pianifica il check delle 04:00 AM
  scheduleDailySanityCheck();

  logger.info('[Sync-lsyncd] Monitoraggio lsyncd attivo.');
}

function stopSync() {
  logger.info('[Sync-lsyncd] Servizio di monitoraggio arrestato.');
}

function getSyncStatus() {
  return syncStats;
}

module.exports = {
  startSync,
  stopSync,
  getSyncStatus,
  handleWebhook
};
