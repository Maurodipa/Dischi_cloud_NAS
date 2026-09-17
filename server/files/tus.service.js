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

/**
 * Estrae e verifica il JWT direttamente da req, senza dipendere da req.user.
 * Prova: 1) Authorization header (Bearer), 2) cookie access_token, 3) cookie raw, 4) query param.
 * Necessario perché @tus/server gestisce il routing internamente e
 * l'integrazione con i middleware Express non è affidabile al 100%.
 */
function extractAndVerifyToken(req, upload) {
    let token = null;

    // Helper per leggere header sia da Express (req.headers.xyz) sia da Web Request (req.headers.get('xyz'))
    const getHeader = (name) => {
        if (!req.headers) return null;
        if (typeof req.headers.get === 'function') return req.headers.get(name);
        return req.headers[name.toLowerCase()];
    };

    // DEBUG META
    if (upload && upload.metadata) {
        logger.info(`[TUS DEBUG] Metadata ricevuti: ${Object.keys(upload.metadata).join(', ')}`);
    } else {
        logger.info(`[TUS DEBUG] Nessun metadata disponibile. upload=${!!upload}`);
    }

    // METODO 1 (preferito): Token nel metadata TUS
    if (upload && upload.metadata) {
        token = upload.metadata.token || upload.metadata.authtoken || upload.metadata.authToken || null;
    }

    // METODO 2: Authorization header (Bearer)
    if (!token) {
        const auth = getHeader('authorization');
        if (auth && auth.startsWith('Bearer ')) {
            token = auth.slice(7).split(',')[0].trim();
        }
    }

    // METODO 3: Cookie (da cookie-parser se Express, o raw)
    if (!token && req.cookies) {
        token = req.cookies.access_token || req.cookies.accessToken || null;
    }

    if (!token) {
        const cookieHeader = getHeader('cookie');
        if (cookieHeader) {
            for (const part of cookieHeader.split(';')) {
                const idx = part.indexOf('=');
                if (idx < 0) continue;
                const name = part.slice(0, idx).trim();
                const val = part.slice(idx + 1).trim();
                if (name === 'access_token' || name === 'accessToken') {
                    token = decodeURIComponent(val);
                    break;
                }
            }
        }
    }

    if (!token) {
        let headersList = 'N/A';
        if (req.headers) {
            if (typeof req.headers.keys === 'function') {
                headersList = Array.from(req.headers.keys()).join(', ');
            } else {
                headersList = Object.keys(req.headers).join(', ');
            }
        }
        logger.warn(`[TUS] Nessun token trovato. Headers: ${headersList}`);
        logger.warn(`[TUS DEBUG] upload-metadata grezzo: ${getHeader('upload-metadata')}`);
        return null;
    }

    try {
        return jwt.verify(token, config.jwtSecret);
    } catch (err) {
        logger.warn(`[TUS] Token non valido: ${err.message}`);
        return null;
    }
}

const tusServer = new Server({
    path: '/api/tus',
    datastore: new FileStore({ directory: tusTmpDir }),
    namingFunction: (req) => {
        return require('crypto').randomBytes(16).toString('hex');
    },
    // onUploadCreate riceve (req, upload) in @tus/server v2 (NON riceve 'res')
    onUploadCreate: async (req, upload) => {
        try {
            // Usa req.user se già impostato da Express, altrimenti verifica il token manualmente
            // Prima controlla il metadata (metodo più affidabile), poi gli header HTTP
            const user = req.user || extractAndVerifyToken(req, upload);

            if (!user) {
                logger.warn(`[TUS] Accesso non autorizzato. IP: ${req.url}`);
                throw { status_code: 401, body: 'Unauthorized' };
            }

            upload.metadata = upload.metadata || {};
            upload.metadata.username = user.username || user.id;

            if (!upload.metadata.filename) {
                throw { status_code: 400, body: 'filename is required in metadata' };
            }

            logger.info(`[TUS] Upload avviato: ${upload.metadata.filename} per utente ${upload.metadata.username}`);
            
            // @tus/server v2 si aspetta che ritorniamo un oggetto con eventuali modifiche ai metadata
            return { metadata: upload.metadata };
        } catch (err) {
            if (err.status_code) throw err;
            logger.error(`[TUS] Errore inatteso in onUploadCreate: ${err.message}`);
            throw { status_code: 500, body: 'Internal Server Error' };
        }
    },
    onUploadFinish: async (req, upload) => {
        try {
            const username = upload.metadata.username;
            const filename = upload.metadata.filename;
            const relativePath = upload.metadata.relativePath || '/';

            if (!username || !filename) {
                throw new Error(`Metadata mancante: username=${username}, filename=${filename}`);
            }

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

            // Pulizia file .json creato da @tus/file-store
            const infoFile = tempFilePath + '.json';
            if (await fse.pathExists(infoFile)) {
                await fse.remove(infoFile);
            }

            return {};
        } catch (err) {
            logger.error(`[TUS] Errore nello spostamento del file completato: ${err.message}`);
            // Returning error prevents 204 success response
            throw { status_code: 500, body: 'Error moving file' };
        }
    }
});

// Funzione per recuperare i file rimasti bloccati in .tus_tmp
const rescueStuckUploads = async () => {
    try {
        if (!await fse.pathExists(tusTmpDir)) return;
        const files = await fse.readdir(tusTmpDir);
        const infoFiles = files.filter(f => f.endsWith('.json'));
        
        for (const infoFile of infoFiles) {
            try {
                const infoPath = path.join(tusTmpDir, infoFile);
                const infoData = await fse.readJson(infoPath);
                
                // Se l'upload è completato
                if (infoData && infoData.offset === infoData.size && infoData.size > 0) {
                    const uploadId = infoData.id;
                    const dataFile = path.join(tusTmpDir, uploadId);
                    
                    if (await fse.pathExists(dataFile)) {
                        logger.info(`[TUS Rescue] Trovato file completato ma non spostato: ${infoData.metadata?.filename}`);
                        
                        const username = infoData.metadata?.username;
                        const filename = infoData.metadata?.filename;
                        const relativePath = infoData.metadata?.relativePath || '/';
                        
                        if (username && filename) {
                            const userRoot = path.resolve(config.primaryDisk, username);
                            const cleanPath = relativePath.replace(/^[\/\\]/, '');
                            const targetDir = path.resolve(userRoot, cleanPath);
                            const targetFile = path.resolve(targetDir, filename);
                            
                            await fse.ensureDir(targetDir);
                            await fse.move(dataFile, targetFile, { overwrite: true });
                            await fse.remove(infoPath);
                            logger.info(`[TUS Rescue] File recuperato e spostato in: ${targetFile}`);
                        }
                    }
                }
            } catch (e) {
                logger.error(`[TUS Rescue] Errore nel processare ${infoFile}: ${e.message}`);
            }
        }
    } catch (err) {
        logger.error(`[TUS Rescue] Errore generale: ${err.message}`);
    }
};

module.exports = {
    tusServer,
    rescueStuckUploads
};
