const fs = require('fs-extra');
const path = require('path');
const { primaryDisk } = require('../config.js');
const logger = require('../utils/logger.js');

const cryptoService = require('../crypto/crypto.service.js');

const mimeTypes = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4'
};

const getMimeType = (ext) => mimeTypes[ext.toLowerCase()] || 'application/octet-stream';

class FilesService {
  getMimeType(ext) {
    return getMimeType(ext);
  }

  getAbsolutePath(username, relativePath) {
    if (!username) throw new Error('Username required for file operations');
    const userRoot = path.resolve(primaryDisk, username);
    const cleanPath = (relativePath || '/').replace(/^[\/\\]/, '');
    const resolvedPath = path.resolve(userRoot, cleanPath);
    if (!resolvedPath.startsWith(userRoot)) {
      logger.warn(`Tentativo di path traversal: ${relativePath} da ${username}`);
      throw new Error('Path traversal detected');
    }
    return resolvedPath;
  }

  async listFiles(username, relativePath) {
    const targetPath = this.getAbsolutePath(username, relativePath);
    logger.info(`Lettura cartella: ${targetPath}`);
    
    if (!(await fs.pathExists(targetPath))) {
      await fs.ensureDir(targetPath);
    }

    const items = await fs.readdir(targetPath);
    const results = [];

    for (const item of items) {
      const itemPath = path.join(targetPath, item);
      const stat = await fs.stat(itemPath);
      let reportedSize = stat.size;

      if (!stat.isDirectory()) {
        const encrypted = await cryptoService.isEncrypted(itemPath);
        if (encrypted) {
          reportedSize = Math.max(0, stat.size - cryptoService.HEADER_LENGTH);
        }
      }

      results.push({
        name: item,
        path: path.posix.join(relativePath || '/', item),
        isDirectory: stat.isDirectory(),
        size: reportedSize,
        modifiedAt: stat.mtime,
        mimeType: stat.isDirectory() ? null : getMimeType(path.extname(item))
      });
    }
    return results;
  }

  async getFileInfo(username, relativePath) {
    const targetPath = this.getAbsolutePath(username, relativePath);
    const stat = await fs.stat(targetPath);
    let reportedSize = stat.size;

    if (!stat.isDirectory()) {
      const encrypted = await cryptoService.isEncrypted(targetPath);
      if (encrypted) {
        reportedSize = Math.max(0, stat.size - cryptoService.HEADER_LENGTH);
      }
    }

    return {
      name: path.basename(targetPath),
      size: reportedSize,
      modified: stat.mtime,
      mimeType: getMimeType(path.extname(targetPath))
    };
  }

  async uploadFiles(username, currentPath, files) {
    const targetDir = this.getAbsolutePath(username, currentPath);
    await fs.ensureDir(targetDir);

    const uploaded = [];
    for (const file of files) {
      const relativeFilePath = file.originalname || file.name;
      const targetPath = path.resolve(targetDir, relativeFilePath);
      
      if (!targetPath.startsWith(targetDir)) {
        throw new Error('Path traversal in originalname detected');
      }

      await fs.ensureDir(path.dirname(targetPath));
      await fs.move(file.path, targetPath, { overwrite: true });
      uploaded.push(relativeFilePath);
    }
    return uploaded;
  }

  async deleteItem(username, relativePath) {
    const targetPath = this.getAbsolutePath(username, relativePath);
    logger.info(`Eliminazione: ${targetPath}`);
    await fs.remove(targetPath);
  }

  async renameItem(username, oldPath, newPath) {
    const resolvedOld = this.getAbsolutePath(username, oldPath);
    const resolvedNew = this.getAbsolutePath(username, newPath);
    logger.info(`Rinomina: ${resolvedOld} -> ${resolvedNew}`);
    await fs.rename(resolvedOld, resolvedNew);
  }

  async createDirectory(username, relativePath) {
    const targetPath = this.getAbsolutePath(username, relativePath);
    logger.info(`Creazione cartella: ${targetPath}`);
    await fs.ensureDir(targetPath);
  }

  async getDiskUsage(username) {
    const userRoot = path.resolve(primaryDisk, username);
    logger.info(`Lettura spazio disco per: ${userRoot}`);
    
    const calculateFolderSize = async (dir) => {
      let total = 0;
      try {
        const items = await fs.readdir(dir);
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = await fs.stat(itemPath);
          if (stat.isDirectory()) {
            total += await calculateFolderSize(itemPath);
          } else {
            total += stat.size;
          }
        }
      } catch (e) {
        logger.error(`Errore durante il calcolo dimensione cartella ${dir}`, e);
      }
      return total;
    };

    try {
      await fs.ensureDir(userRoot);
      const statfs = require('fs').promises.statfs;
      const stats = await statfs(primaryDisk);
      
      const totalSpace = stats.blocks * stats.bsize;
      const freeSpace = stats.bavail * stats.bsize;
      
      // Calculate only this specific user's folder size
      const usedSpace = await calculateFolderSize(userRoot);
      
      return { usedSpace, totalSpace, freeSpace };
    } catch (err) {
      logger.error('Errore nel calcolo dello spazio disco', err);
      return { usedSpace: 0, totalSpace: 1, freeSpace: 1 };
    }
  }
}

module.exports = new FilesService();
