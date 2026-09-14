const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { primaryDisk, maxUploadSize } = require('../config.js');
const logger = require('../utils/logger.js');

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // Use path from req.body (sent by frontend FormData)
      const targetDir = req.body.path || '/';
      const username = req.user.username;
      const userRoot = path.resolve(primaryDisk, username);
      const resolvedPath = path.resolve(userRoot, targetDir.replace(/^\/|\\/, ''));
      
      if (!resolvedPath.startsWith(userRoot)) {
        return cb(new Error('Path traversal detected'));
      }
      
      await fs.ensureDir(resolvedPath);
      cb(null, resolvedPath);
    } catch (err) {
      logger.error('Error in multer destination:', err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const sanitizedName = file.originalname.replace(/[\0\x08-\x0F\x10-\x1F\x7F"\*\/\\:\<\>\?\|]/g, '_').replace(/\.\.+/g, '.');
    cb(null, sanitizedName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: maxUploadSize
  }
});

module.exports = { upload };
