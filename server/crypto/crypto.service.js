// server/crypto/crypto.service.js
// Servizio di cifratura/decifratura Server-Side Encryption (SSE) con AES-256-CTR

const crypto = require('crypto');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const { Transform } = require('stream');
const config = require('../config.js');
const logger = require('../utils/logger.js');

// Header fisso di 16 byte per identificare un file cifrato da Dischi Cloud NAS
const MAGIC_HEADER = Buffer.from('DCLOUD-ENC-V1\0\0\0'); // Exactly 16 bytes
const MAGIC_LENGTH = 16;
const IV_LENGTH = 16;
const HEADER_LENGTH = MAGIC_LENGTH + IV_LENGTH; // 32 bytes total

/**
 * Deriva una chiave AES-256 (32 byte) specifica per utente
 * usando HMAC-SHA256 con la chiave master dell'applicazione.
 */
function deriveUserKey(username) {
  const masterKey = config.jwtSecret; // fallback o usata come base
  const effectiveMaster = config.ENCRYPTION_MASTER_KEY || masterKey;
  
  return crypto.createHmac('sha256', effectiveMaster)
    .update(`user-key-salt:${username}`)
    .digest(); // 32 byte Buffer per AES-256
}

/**
 * Controlla se un file su disco è già cifrato leggendo i primi 16 byte.
 */
async function isEncrypted(filePath) {
  try {
    if (!await fse.pathExists(filePath)) return false;
    const stat = await fse.stat(filePath);
    if (stat.size < HEADER_LENGTH) return false;

    const fd = await fse.open(filePath, 'r');
    const buffer = Buffer.alloc(MAGIC_LENGTH);
    await fse.read(fd, buffer, 0, MAGIC_LENGTH, 0);
    await fse.close(fd);

    return buffer.equals(MAGIC_HEADER);
  } catch (err) {
    logger.error(`[Crypto] Errore verifica isEncrypted su ${filePath}: ${err.message}`);
    return false;
  }
}

/**
 * Crea uno Transform stream che antepone l'header [MAGIC (16B)][IV (16B)]
 * e cifra tutto il contenuto in streaming usando AES-256-CTR.
 */
function createEncryptStream(userKey) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-ctr', userKey, iv);
  
  let headerSent = false;

  return new Transform({
    transform(chunk, encoding, callback) {
      if (!headerSent) {
        headerSent = true;
        // Invia header fisso + IV prima del primo blocco cifrato
        this.push(Buffer.concat([MAGIC_HEADER, iv]));
      }
      const encryptedChunk = cipher.update(chunk);
      this.push(encryptedChunk);
      callback();
    },
    flush(callback) {
      if (!headerSent) {
        // Gestione file di 0 byte
        this.push(Buffer.concat([MAGIC_HEADER, iv]));
      }
      const finalChunk = cipher.final();
      if (finalChunk.length > 0) {
        this.push(finalChunk);
      }
      callback();
    }
  });
}

/**
 * Crea uno Transform stream per decifrare un file AES-256-CTR.
 * Legge ed estrae il MAGIC ed l'IV dai primi 32 byte, poi decifra il resto.
 * Se il file non è cifrato (manca MAGIC), trasmette i byte in chiaro come passthrough.
 */
function createDecryptStream(userKey) {
  let headerBuffer = Buffer.alloc(0);
  let decipher = null;
  let isPlaintextFallback = false;

  return new Transform({
    transform(chunk, encoding, callback) {
      if (!decipher && !isPlaintextFallback) {
        headerBuffer = Buffer.concat([headerBuffer, chunk]);

        if (headerBuffer.length >= HEADER_LENGTH) {
          const magic = headerBuffer.subarray(0, MAGIC_LENGTH);
          
          if (magic.equals(MAGIC_HEADER)) {
            const iv = headerBuffer.subarray(MAGIC_LENGTH, HEADER_LENGTH);
            decipher = crypto.createDecipheriv('aes-256-ctr', userKey, iv);
            const remainingData = headerBuffer.subarray(HEADER_LENGTH);
            if (remainingData.length > 0) {
              this.push(decipher.update(remainingData));
            }
          } else {
            // Passthrough per file in chiaro pre-migrazione
            isPlaintextFallback = true;
            this.push(headerBuffer);
          }
          headerBuffer = null;
        }
        return callback();
      }

      if (isPlaintextFallback) {
        this.push(chunk);
      } else {
        this.push(decipher.update(chunk));
      }
      callback();
    },
    flush(callback) {
      if (headerBuffer && headerBuffer.length > 0) {
        this.push(headerBuffer); // File più piccolo del'header, passthrough
      } else if (decipher) {
        const finalChunk = decipher.final();
        if (finalChunk.length > 0) {
          this.push(finalChunk);
        }
      }
      callback();
    }
  });
}

/**
 * Cifra un file esistente sul disco "in place" (usando un file temporaneo affiancato).
 * Viene usato dallo script di migrazione o post-upload.
 */
async function encryptFileInPlace(filePath, userKey) {
  if (await isEncrypted(filePath)) {
    return false; // Già cifrato
  }

  const tempPath = `${filePath}.enc_tmp_${Date.now()}`;
  
  await new Promise((resolve, reject) => {
    const reader = fs.createReadStream(filePath);
    const writer = fs.createWriteStream(tempPath);
    const encryptor = createEncryptStream(userKey);

    reader.on('error', reject);
    writer.on('error', reject);
    encryptor.on('error', reject);

    writer.on('finish', resolve);

    reader.pipe(encryptor).pipe(writer);
  });

  // Sostituisce atomicamente il file originale con la versione cifrata
  await fse.move(tempPath, filePath, { overwrite: true });
  return true;
}

module.exports = {
  deriveUserKey,
  isEncrypted,
  createEncryptStream,
  createDecryptStream,
  encryptFileInPlace,
  HEADER_LENGTH
};
