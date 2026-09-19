// server/sync/sync.service.js
// Servizio di monitoraggio sincronizzazione integrato con lsyncd (demone di sistema).
// Legge /var/log/lsyncd/lsyncd.status ogni 30 secondi per aggiornare la dashboard.

const fse = require('fs-extra');
const config = require('../config.js');
const logger = require('../utils/logger.js');

const LSYNCD_STATUS_FILE = '/var/log/lsyncd/lsyncd.status';
const LSYNCD_LOG_FILE    = '/var/log/lsyncd/lsyncd.log';
const POLL_INTERVAL_MS   = 30 * 1000; // 30 secondi (uguale a statusInterval in lsyncd)

let pollTimer = null;

const syncStats = {
  totalSynced: 0,
  lastSyncTime: null,
  errors: 0,
  isHealthy: true,
  pendingDelays: 0,
  mode: 'lsyncd'
};

// ─────────────────────────────────────────────
// Lettura del file di stato di lsyncd
// ─────────────────────────────────────────────

async function readLsyncdStatus() {
  try {
    if (!await fse.pathExists(LSYNCD_STATUS_FILE)) {
      // Il file non esiste: lsyncd potrebbe non essere ancora partito o avere avuto un errore
      syncStats.isHealthy = false;
      logger.warn(`[Sync-lsyncd] File di stato non trovato: ${LSYNCD_STATUS_FILE}. lsyncd potrebbe non essere attivo.`);
      return;
    }

    const content = await fse.readFile(LSYNCD_STATUS_FILE, 'utf8');

    // Estrai il timestamp del report
    const timeMatch = content.match(/Lsyncd status report at (.+)/);
    if (timeMatch) {
      syncStats.lastSyncTime = new Date(timeMatch[1]).toISOString();
    }

    // Controlla i ritardi in coda (0 = idle e in salute, >0 = sincronizzazione in corso)
    const delayMatch = content.match(/There are (\d+) delays?/);
    if (delayMatch) {
      const delays = parseInt(delayMatch[1], 10);
      syncStats.pendingDelays = delays;

      if (delays === 0) {
        syncStats.isHealthy = true;
      }
      // Se ci sono delay, non è necessariamente un errore: rsync sta solo lavorando
    }

    // Controlla il log per errori recenti (ultime 30 righe)
    if (await fse.pathExists(LSYNCD_LOG_FILE)) {
      const logContent = await fse.readFile(LSYNCD_LOG_FILE, 'utf8');
      const lastLines = logContent.trim().split('\n').slice(-30);
      const hasRecentError = lastLines.some(l => l.includes('Error:') || l.includes('FAIL'));

      if (hasRecentError) {
        syncStats.errors++;
        syncStats.isHealthy = false;
        logger.warn('[Sync-lsyncd] Rilevati errori recenti nel log di lsyncd.');
      }
    }

    // Incrementa il contatore di sincronizzazioni riuscite (segnale di vita)
    if (syncStats.isHealthy) {
      syncStats.totalSynced++;
    }

    logger.debug(`[Sync-lsyncd] Stato lsyncd: delays=${syncStats.pendingDelays}, healthy=${syncStats.isHealthy}`);

  } catch (err) {
    syncStats.isHealthy = false;
    logger.error(`[Sync-lsyncd] Errore nella lettura del file di stato: ${err.message}`);
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
  logger.info(`[Sync-lsyncd] Prossimo sanity check: ${next4am.toLocaleString('it-IT')}`);

  setTimeout(() => {
    readLsyncdStatus();
    setInterval(readLsyncdStatus, 24 * 60 * 60 * 1000);
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

  logger.info('[Sync-lsyncd] Avvio monitoraggio lsyncd (polling ogni 30s)...');

  await fse.ensureDir(config.primaryDisk);
  await fse.ensureDir(config.backupDisk);

  // Prima lettura immediata all'avvio
  await readLsyncdStatus();

  // Polling ogni 30 secondi
  pollTimer = setInterval(readLsyncdStatus, POLL_INTERVAL_MS);

  // Sanity check profondo ogni notte alle 04:00 AM
  scheduleDailySanityCheck();

  logger.info('[Sync-lsyncd] Monitoraggio lsyncd attivo.');
}

function stopSync() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  logger.info('[Sync-lsyncd] Monitoraggio arrestato.');
}

function getSyncStatus() {
  return syncStats;
}

module.exports = {
  startSync,
  stopSync,
  getSyncStatus
};
