const chokidar = require('chokidar');
const fse = require('fs-extra');
const path = require('path');
const config = require('../config.js');
const logger = require('../utils/logger.js');

let watcher = null;
let isSyncing = false;

const syncStats = {
  totalSynced: 0,
  lastSyncTime: null,
  errors: 0,
  isHealthy: true
};

const queue = [];

async function processQueue() {
  if (isSyncing || queue.length === 0) return;
  isSyncing = true;
  
  while (queue.length > 0) {
    const task = queue.shift();
    await executeTaskWithRetry(task, 3);
  }
  
  isSyncing = false;
}

async function executeTaskWithRetry(task, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      if (task.type === 'copy') {
        await fse.copy(task.src, task.dest, { preserveTimestamps: true });
        logger.info(`[Sync] Copied: ${task.src} -> ${task.dest}`);
      } else if (task.type === 'remove') {
        await fse.remove(task.dest);
        logger.info(`[Sync] Removed: ${task.dest}`);
      }
      
      syncStats.totalSynced++;
      syncStats.lastSyncTime = new Date().toISOString();
      syncStats.isHealthy = true;
      return; // Success
    } catch (error) {
      logger.error(`[Sync] Task failed (${i + 1}/${retries}): ${task.src || task.dest} - ${error.message}`);
      if (i === retries - 1) {
        syncStats.errors++;
        syncStats.isHealthy = false;
        logger.error(`[Sync] Task permanently failed: ${task.src || task.dest}`);
      } else {
        // Wait 1 second before retrying
        await new Promise(res => setTimeout(res, 1000));
      }
    }
  }
}

function queueOperation(type, relativePath) {
  if (!relativePath) return; // Ignore root itself
  const src = path.join(config.primaryDisk, relativePath);
  const dest = path.join(config.backupDisk, relativePath);
  queue.push({ type, src, dest });
  processQueue();
}

async function performInitialSync() {
  logger.info('[Sync] Starting initial sync...');
  try {
    if (!await fse.pathExists(config.backupDisk)) {
      await fse.ensureDir(config.backupDisk);
    }
    
    const copyRecursive = async (src, dest) => {
      const entries = await fse.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        // Ignore internal config folder and temp uploads
        if (entry.name.startsWith('.dischi-cloud') || entry.name.startsWith('.tus_tmp')) continue;
        
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          await fse.ensureDir(destPath);
          await copyRecursive(srcPath, destPath);
        } else {
          const srcStat = await fse.stat(srcPath);
          let needsCopy = true;
          
          if (await fse.pathExists(destPath)) {
            const destStat = await fse.stat(destPath);
            if (srcStat.mtime.getTime() === destStat.mtime.getTime() && srcStat.size === destStat.size) {
              needsCopy = false;
            }
          }
          
          if (needsCopy) {
            queueOperation('copy', path.relative(config.primaryDisk, srcPath));
          }
        }
      }
    };
    
    await copyRecursive(config.primaryDisk, config.backupDisk);
    logger.info('[Sync] Initial sync queued successfully.');
  } catch (error) {
    logger.error(`[Sync] Initial sync error: ${error.message}`);
    syncStats.isHealthy = false;
    syncStats.errors++;
  }
}

async function startSync() {
  if (!config.syncEnabled) {
    logger.info('[Sync] Sync is disabled in config.');
    return;
  }
  
  logger.info('[Sync] Starting sync service...');
  
  await fse.ensureDir(config.primaryDisk);
  await fse.ensureDir(config.backupDisk);
  
  await performInitialSync();
  
  watcher = chokidar.watch(config.primaryDisk, {
    ignored: /(^|[\/\\])(\.dischi-cloud|\.tus_tmp)/, // ignore internal database and temp upload chunks
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 30000,
      pollInterval: 500
    }
  });

  watcher
    .on('add', (filePath) => queueOperation('copy', path.relative(config.primaryDisk, filePath)))
    .on('change', (filePath) => queueOperation('copy', path.relative(config.primaryDisk, filePath)))
    .on('unlink', (filePath) => queueOperation('remove', path.relative(config.primaryDisk, filePath)))
    .on('addDir', (dirPath) => queueOperation('copy', path.relative(config.primaryDisk, dirPath)))
    .on('unlinkDir', (dirPath) => queueOperation('remove', path.relative(config.primaryDisk, dirPath)))
    .on('error', (error) => {
      logger.error(`[Sync] Watcher error: ${error.message}`);
      syncStats.isHealthy = false;
    });
    
  logger.info('[Sync] Watcher active.');
}

function stopSync() {
  if (watcher) {
    watcher.close();
    logger.info('[Sync] Watcher stopped.');
  }
}

function getSyncStatus() {
  return syncStats;
}

module.exports = {
  startSync,
  stopSync,
  getSyncStatus
};
