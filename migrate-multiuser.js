const fs = require('fs-extra');
const path = require('path');
const config = require('./server/config.js');

async function migrate() {
  const usersFile = path.join(config.primaryDisk, '.dischi-cloud', 'users.json');
  if (await fs.pathExists(usersFile)) {
    const users = await fs.readJson(usersFile);
    let migrated = false;
    for (const user of users) {
      if (!user.role) {
        user.role = 'admin';
        migrated = true;
        
        const userDir = path.join(config.primaryDisk, user.username);
        await fs.ensureDir(userDir);
        
        const rootItems = await fs.readdir(config.primaryDisk);
        for (const item of rootItems) {
          if (item === '.dischi-cloud' || item === user.username) continue;
          
          const oldPath = path.join(config.primaryDisk, item);
          const newPath = path.join(userDir, item);
          
          console.log(`Moving ${item} to ${user.username}/...`);
          try {
            await fs.move(oldPath, newPath);
          } catch(e) {
            console.error(`Failed to move ${item}:`, e);
          }
        }
      }
    }
    
    if (migrated) {
      await fs.writeJson(usersFile, users, { spaces: 2 });
      console.log('Migration completed successfully.');
    } else {
      console.log('No migration needed.');
    }
  } else {
    console.log('users.json not found.');
  }
}

migrate().catch(console.error);
