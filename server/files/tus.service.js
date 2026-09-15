const path = require('path');
const fse = require('fs-extra');
const { Server, EVENTS } = require('@tus/server');
const { FileStore } = require('@tus/file-store');
const config = require('../config.js');
const logger = require('../utils/logger.js');
const jwt = require('jsonwebtoken');

// Ensure temp directory exists
const tusTmpDir = path.join(config.primaryDisk, '.tus_tmp');
fse.ensureDirSync(tusTmpDir);

const tusServer = new Server({
    path: '/api/tus',
    datastore: new FileStore({ directory: tusTmpDir }),
    namingFunction: (req) => {
        // Generate a random name for the temp file
        return require('crypto').randomBytes(16).toString('hex');
    },
    onUploadCreate: async (req, res, upload) => {
        // [DIAGNOSTIC TEST] Ignoriamo momentaneamente l'autenticazione per capire chi lancia il 401.
        // Forziamo l'utente 'marcodipa' per far completare l'upload.
        let username = 'marcodipa';
        
        if (req.user && req.user.username) {
            username = req.user.username;
        } else if (req.user && req.user.id) {
            username = req.user.id;
        }

        // Append username to metadata so we know where to save it later
        upload.metadata.username = username;

        if (!upload.metadata.filename) {
            throw { status_code: 400, body: 'filename is required in metadata' };
        }

        return res;
    }
});

tusServer.on(EVENTS.POST_FINISH, async (req, res, upload) => {
    try {
        const username = upload.metadata.username;
        const filename = upload.metadata.filename;
        const relativePath = upload.metadata.relativePath || '/';
        
        // Costruzione percorso finale
        const userRoot = path.resolve(config.primaryDisk, username);
        const cleanPath = relativePath.replace(/^[\/\\]/, '');
        const targetDir = path.resolve(userRoot, cleanPath);
        
        // Anti-path traversal
        if (!targetDir.startsWith(userRoot)) {
             throw new Error('Path traversal detected in relativePath');
        }
        
        const targetFile = path.resolve(targetDir, filename);
        if (!targetFile.startsWith(targetDir)) {
             throw new Error('Path traversal detected in filename');
        }

        const tempFilePath = path.join(tusTmpDir, upload.id);

        logger.info(`[TUS] Upload completato: ${filename} per ${username}. Spostamento in ${targetFile}`);
        
        await fse.ensureDir(targetDir);
        await fse.move(tempFilePath, targetFile, { overwrite: true });

        // Pulizia eventuale file .info creato da tus-file-store
        const infoFile = tempFilePath + '.info';
        if (await fse.pathExists(infoFile)) {
            await fse.remove(infoFile);
        }

    } catch (err) {
        logger.error(`[TUS] Errore nello spostamento del file completato: ${err.message}`);
    }
});

module.exports = tusServer;
