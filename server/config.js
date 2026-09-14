const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Carica variabili d'ambiente
dotenv.config();

function generateAndSaveJwtSecret() {
    let secret = process.env.JWT_SECRET;
    if (!secret) {
        secret = crypto.randomBytes(64).toString('hex');
        const envPath = path.resolve(process.cwd(), '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        if (envContent.includes('JWT_SECRET=')) {
            envContent = envContent.replace(/JWT_SECRET=.*/, `JWT_SECRET=${secret}`);
        } else {
            envContent += `\nJWT_SECRET=${secret}\n`;
        }
        
        fs.writeFileSync(envPath, envContent, 'utf8');
        process.env.JWT_SECRET = secret;
    }
    return secret;
}

function ensureDirectoryExists(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    } catch (err) {
        console.warn(`⚠️  Impossibile creare la cartella "${dirPath}": ${err.message}`);
        console.warn(`   Assicurati che il disco sia collegato e il percorso sia corretto nel file .env`);
    }
}

const os = require('os');
const isWin = os.platform() === 'win32';
const defaultPrimary = isWin ? 'C:/CloudData' : '/mnt/disk1/CloudData';
const defaultBackup = isWin ? 'C:/CloudBackup' : '/mnt/disk2/CloudBackup';

const config = {
    // SCREAMING_SNAKE_CASE (original)
    PRIMARY_DISK: process.env.PRIMARY_DISK || defaultPrimary,
    BACKUP_DISK: process.env.BACKUP_DISK || defaultBackup,
    HTTPS_PORT: parseInt(process.env.HTTPS_PORT, 10) || 443,
    WEBDAV_PORT: parseInt(process.env.WEBDAV_PORT, 10) || 1900,
    JWT_SECRET: generateAndSaveJwtSecret(),
    ACCESS_TOKEN_EXPIRY: parseInt(process.env.ACCESS_TOKEN_EXPIRY, 10) || 15,
    REFRESH_TOKEN_EXPIRY: parseInt(process.env.REFRESH_TOKEN_EXPIRY, 10) || 7,
    MAX_UPLOAD_SIZE: parseInt(process.env.MAX_UPLOAD_SIZE, 10) || 10737418240,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    SYNC_ENABLED: process.env.SYNC_ENABLED !== 'false',
};

// camelCase aliases used by various modules
config.primaryDisk = config.PRIMARY_DISK;
config.backupDisk = config.BACKUP_DISK;
config.httpsPort = config.HTTPS_PORT;
config.webdavPort = config.WEBDAV_PORT;
config.jwtSecret = config.JWT_SECRET;
config.accessTokenExpiry = `${config.ACCESS_TOKEN_EXPIRY}m`;
config.refreshTokenExpiry = `${config.REFRESH_TOKEN_EXPIRY}d`;
config.maxUploadSize = config.MAX_UPLOAD_SIZE;
config.logLevel = config.LOG_LEVEL;
config.syncEnabled = config.SYNC_ENABLED;

// Ensure primary and backup disks exist
ensureDirectoryExists(config.PRIMARY_DISK);
ensureDirectoryExists(config.BACKUP_DISK);

module.exports = Object.freeze(config);
