// scripts/migrate-encrypt.js
// Script di migrazione una-tantum per cifrare tutti i file esistenti con Server-Side Encryption (AES-256-CTR)

const path = require('path');
const fse = require('fs-extra');
const config = require('../server/config.js');
const cryptoService = require('../server/crypto/crypto.service.js');

async function migrate() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log(' 🔒 Dischi Cloud NAS — Migrazione Server-Side Encryption (SSE)');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`📁 Cartella radice dati: ${config.primaryDisk}`);
  console.log(`🔑 Chiave master caricata: ${config.ENCRYPTION_MASTER_KEY ? 'OK' : 'MANCANTE'}`);
  console.log('────────────────────────────────────────────────────────────────');

  if (!config.ENCRYPTION_MASTER_KEY) {
    console.error('❌ ERRORE FATALE: ENCRYPTION_MASTER_KEY non trovata nel .env!');
    process.exit(1);
  }

  const userFolders = await fse.readdir(config.primaryDisk);
  let totalFiles = 0;
  let encryptedFiles = 0;
  let skippedFiles = 0;
  let errorFiles = 0;

  for (const userFolder of userFolders) {
    // Ignora directory di sistema e cartelle temporanee
    if (userFolder.startsWith('.')) continue;

    const userPath = path.join(config.primaryDisk, userFolder);
    const stat = await fse.stat(userPath);

    if (!stat.isDirectory()) continue;

    console.log(`\n👤 Elaborazione cartella utente: [${userFolder}]`);
    const userKey = cryptoService.deriveUserKey(userFolder);

    const processDirectory = async (dir) => {
      const items = await fse.readdir(dir);
      for (const item of items) {
        if (item.startsWith('.')) continue; // Salta file nascosti

        const itemPath = path.join(dir, item);
        const itemStat = await fse.stat(itemPath);

        if (itemStat.isDirectory()) {
          await processDirectory(itemPath);
        } else {
          totalFiles++;
          const relativePath = path.relative(config.primaryDisk, itemPath);

          try {
            const alreadyEncrypted = await cryptoService.isEncrypted(itemPath);
            if (alreadyEncrypted) {
              console.log(`  [GIÀ CIFRATO] ${relativePath}`);
              skippedFiles++;
            } else {
              process.stdout.write(`  [CIFRATURA...] ${relativePath} ... `);
              const success = await cryptoService.encryptFileInPlace(itemPath, userKey);
              if (success) {
                console.log('OK ✅');
                encryptedFiles++;
              } else {
                console.log('GIÀ CIFRATO');
                skippedFiles++;
              }
            }
          } catch (err) {
            console.log(`ERRORE ❌ (${err.message})`);
            errorFiles++;
          }
        }
      }
    };

    await processDirectory(userPath);
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(' 📊 RIEPILOGO MIGRAZIONE');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(` Total file trovati:    ${totalFiles}`);
  console.log(` File cifrati ora:      ${encryptedFiles}`);
  console.log(` File già cifrati:      ${skippedFiles}`);
  console.log(` Errore durante cifratura: ${errorFiles}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

migrate().catch(err => {
  console.error('❌ Errore critico durante la migrazione:', err);
  process.exit(1);
});
