const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const filesService = require('./files.service');
const cryptoService = require('../crypto/crypto.service.js');
const { upload } = require('./upload.middleware');
const { requireAuth } = require('../auth/auth.middleware.js');
const logger = require('../utils/logger.js');

router.use(requireAuth);

router.get('/list', async (req, res) => {
  try {
    const dirPath = req.query.path || '/';
    const files = await filesService.listFiles(req.user.username, dirPath);
    res.json({ files });
  } catch (err) {
    logger.error('Errore nel listare i file:', err);
    res.status(400).json({ error: 'Impossibile leggere la cartella', details: err.message });
  }
});

router.get('/download', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'Percorso del file mancante' });
    }
    const absolutePath = filesService.getAbsolutePath(req.user.username, filePath);
    const stat = await fs.stat(absolutePath);
    
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Il percorso è una cartella, usa download-zip' });
    }

    const filename = path.basename(absolutePath);
    const userKey = cryptoService.deriveUserKey(req.user.username);
    const encrypted = await cryptoService.isEncrypted(absolutePath);

    res.setHeader('Content-Type', filesService.getMimeType(path.extname(filename)));
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    if (encrypted) {
      res.setHeader('Content-Length', Math.max(0, stat.size - cryptoService.HEADER_LENGTH));
    } else {
      res.setHeader('Content-Length', stat.size);
    }

    const readStream = fs.createReadStream(absolutePath);
    const decryptStream = cryptoService.createDecryptStream(userKey);

    readStream.on('error', (err) => {
      logger.error('Errore durante la lettura per download:', err);
      if (!res.headersSent) res.status(500).end();
    });

    readStream.pipe(decryptStream).pipe(res);
  } catch (err) {
    logger.error('Errore nel download del file:', err);
    res.status(404).json({ error: 'File non trovato o errore nel percorso', details: err.message });
  }
});

router.get('/download-zip', async (req, res) => {
  try {
    const dirPath = req.query.path || '/';
    const absolutePath = filesService.getAbsolutePath(req.user.username, dirPath);
    const stat = await fs.stat(absolutePath);

    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Il percorso non è una cartella' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipName = path.basename(absolutePath) || 'download';
    const userKey = cryptoService.deriveUserKey(req.user.username);

    res.attachment(`${zipName}.zip`);
    archive.pipe(res);

    archive.on('error', (err) => {
      logger.error('Errore nella creazione dello ZIP:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Errore interno del server durante l\'archiviazione' });
    });

    // Scansione ricorsiva della cartella e aggiunta di ciascun file decifrato al volo
    const addFolderToArchive = async (currentPath, entryPrefix = '') => {
      const items = await fs.readdir(currentPath);
      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const itemStat = await fs.stat(fullPath);
        const entryName = entryPrefix ? `${entryPrefix}/${item}` : item;

        if (itemStat.isDirectory()) {
          await addFolderToArchive(fullPath, entryName);
        } else {
          const readStream = fs.createReadStream(fullPath);
          const decryptStream = cryptoService.createDecryptStream(userKey);
          archive.append(readStream.pipe(decryptStream), { name: entryName });
        }
      }
    };

    await addFolderToArchive(absolutePath);
    await archive.finalize();
  } catch (err) {
    logger.error('Errore nel download dello ZIP:', err);
    if (!res.headersSent) res.status(404).json({ error: 'Cartella non trovata', details: err.message });
  }
});

// Scarica una selezione arbitraria di file/cartelle come ZIP
router.post('/download-zip-selection', async (req, res) => {
  try {
    const { paths: relativePaths } = req.body;
    if (!Array.isArray(relativePaths) || relativePaths.length === 0) {
      return res.status(400).json({ error: 'Nessun elemento selezionato' });
    }

    const userKey = cryptoService.deriveUserKey(req.user.username);
    const archive = archiver('zip', { zlib: { level: 6 } });

    res.attachment('selezione.zip');
    archive.pipe(res);

    archive.on('error', (err) => {
      logger.error('Errore nella creazione dello ZIP selezione:', err);
      if (!res.headersSent) res.status(500).end();
    });

    const addFileToArchive = async (absPath, entryName) => {
      const readStream = fs.createReadStream(absPath);
      const decryptStream = cryptoService.createDecryptStream(userKey);
      archive.append(readStream.pipe(decryptStream), { name: entryName });
    };

    const addFolderToArchive = async (absPath, prefix) => {
      const items = await fs.readdir(absPath);
      for (const item of items) {
        const fullPath = path.join(absPath, item);
        const stat = await fs.stat(fullPath);
        const entryName = prefix ? `${prefix}/${item}` : item;
        if (stat.isDirectory()) {
          await addFolderToArchive(fullPath, entryName);
        } else {
          await addFileToArchive(fullPath, entryName);
        }
      }
    };

    for (const rel of relativePaths) {
      const absPath = filesService.getAbsolutePath(req.user.username, rel);
      const stat = await fs.stat(absPath);
      const entryName = path.basename(absPath);
      if (stat.isDirectory()) {
        await addFolderToArchive(absPath, entryName);
      } else {
        await addFileToArchive(absPath, entryName);
      }
    }

    await archive.finalize();
  } catch (err) {
    logger.error('Errore nel download della selezione ZIP:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Errore durante la preparazione dello ZIP', details: err.message });
  }
});

router.post('/upload', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nessun file caricato' });
    }

    const userKey = cryptoService.deriveUserKey(req.user.username);
    const uploaded = [];

    for (const f of req.files) {
      await cryptoService.encryptFileInPlace(f.path, userKey);
      const stat = await fs.stat(f.path);
      uploaded.push({
        name: f.filename,
        size: Math.max(0, stat.size - cryptoService.HEADER_LENGTH)
      });
    }

    res.json({ message: 'File caricati e cifrati con successo', files: uploaded });
  } catch (err) {
    logger.error('Errore durante l\'upload:', err);
    res.status(500).json({ error: 'Errore durante il caricamento' });
  }
});

router.post('/mkdir', async (req, res) => {
  try {
    const basePath = req.body.path || '/';
    const folderName = (req.body.name || '').trim();

    if (!folderName) {
      return res.status(400).json({ error: 'Nome cartella mancante' });
    }

    // Combina il percorso corrente con il nome della nuova cartella
    const dirPath = path.posix.join(basePath, folderName);
    await filesService.createDirectory(req.user.username, dirPath);
    res.json({ message: 'Cartella creata con successo' });
  } catch (err) {
    logger.error('Errore nella creazione della cartella:', err);
    res.status(400).json({ error: 'Impossibile creare la cartella', details: err.message });
  }
});

router.post('/delete', async (req, res) => {
  try {
    const itemPath = req.body.path || req.query.path;
    if (!itemPath) {
      return res.status(400).json({ error: 'Percorso mancante' });
    }
    await filesService.deleteItem(req.user.username, itemPath);
    res.json({ message: 'Elemento eliminato con successo' });
  } catch (err) {
    logger.error('Errore durante l\'eliminazione:', err);
    res.status(400).json({ error: 'Impossibile eliminare l\'elemento', details: err.message });
  }
});

router.post('/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      return res.status(400).json({ error: 'Percorsi vecchio e nuovo necessari' });
    }
    await filesService.renameItem(req.user.username, oldPath, newPath);
    res.json({ message: 'Rinominato con successo' });
  } catch (err) {
    logger.error('Errore durante la rinomina:', err);
    res.status(400).json({ error: 'Impossibile rinominare', details: err.message });
  }
});

router.get('/disk-usage', async (req, res) => {
  try {
    const usage = await filesService.getDiskUsage(req.user.username);
    res.json(usage);
  } catch (err) {
    logger.error('Errore nel calcolo dell\'utilizzo disco:', err);
    res.status(500).json({ error: 'Impossibile calcolare lo spazio' });
  }
});

module.exports = router;
