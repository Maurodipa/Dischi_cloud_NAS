const { v2: webdav } = require('webdav-server');
const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('../config.js');
const logger = require('../utils/logger.js');
const authService = require('../auth/auth.service.js');

class CustomHTTPAuth {
  constructor(userManager) {
    this.userManager = userManager;
  }

  askForAuthentication(ctx) {
    ctx.response.setHeader('WWW-Authenticate', 'Basic realm="Dischi Cloud"');
    return { 'WWW-Authenticate': 'Basic realm="Dischi Cloud"' };
  }

  async getUserAsync(ctx) {
    const authHeader = ctx.request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      throw webdav.Errors.UserNotFound;
    }
    
    const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const firstColon = decoded.indexOf(':');
    if (firstColon === -1) throw webdav.Errors.UserNotFound;
    
    const username = decoded.substring(0, firstColon);
    const password = decoded.substring(firstColon + 1);
    
    try {
      const user = await authService.validateCredentials(username, password);
      if (user) {
        let wdUser = await new Promise(resolve => {
          this.userManager.getUserByName(username, (err, u) => resolve(err ? null : u));
        });
        
        if (!wdUser) {
          wdUser = this.userManager.addUser(username, password, false);
        }
        return wdUser;
      }
    } catch (err) {
      logger.error(`[WebDAV] Auth error: ${err.message}`);
    }
    
    throw webdav.Errors.UserNotFound;
  }

  getUser(ctx, callback) {
    logger.info(`[WebDAV Debug] getUser called with ${arguments.length} arguments. callback type: ${typeof callback}`);
    if (typeof callback !== 'function') {
      logger.error(`[WebDAV Debug] FATAL: callback is ${typeof callback}`);
      return;
    }
    this.getUserAsync(ctx)
      .then(user => callback(null, user))
      .catch(err => callback(err));
  }
}

async function startWebDAVServer() {
  const userManager = new webdav.SimpleUserManager();
  const privilegeManager = new webdav.SimplePathPrivilegeManager();
  
  // Set up full privileges for root
  const rootPrivileges = ['all'];

  const auth = new CustomHTTPAuth(userManager);

  const server = new webdav.WebDAVServer({
    httpAuthentication: auth,
    privilegeManager: privilegeManager,
    port: config.webdavPort || 1900
  });

  // Root FS is just an empty container
  server.setFileSystem('/', new webdav.VirtualFileSystem());

  return new Promise((resolve, reject) => {
    try {
      const { getHttpsCredentials } = require('../security/https.js');
      const mountedUsers = new Set();
      
      server.beforeRequest((ctx, next) => {
        if (ctx.user) {
          const username = ctx.user.username;
          const userPath = '/' + username;
          
          if (!mountedUsers.has(username)) {
            const physicalPath = path.join(config.primaryDisk, username);
            fs.mkdirSync(physicalPath, { recursive: true });
            server.setFileSystem(userPath, new webdav.PhysicalFileSystem(physicalPath), (success) => {
              if (success) {
                mountedUsers.add(username);
                privilegeManager.setRights(ctx.user, userPath, ['all']);
              }
              next();
            });
          } else {
            // Rights already set during mount
            next();
          }
        } else {
          next();
        }
      });

      const creds = getHttpsCredentials();
      if (creds && creds.key && creds.cert) {
        const options = {
          key: creds.key,
          cert: creds.cert
        };
        const httpsServer = https.createServer(options, (req, res) => {
          server.executeRequest(req, res);
        });
        
        // Disable timeouts for large file uploads
        httpsServer.timeout = 0;
        httpsServer.requestTimeout = 0;
        httpsServer.keepAliveTimeout = 0;
        
        httpsServer.listen(config.webdavPort || 1900, () => {
          logger.info(`[WebDAV] Server running on HTTPS port ${config.webdavPort || 1900}`);
          resolve(httpsServer);
        });
      } else {
        server.start(() => {
          logger.info(`[WebDAV] Server running on HTTP port ${server.options.port}`);
          resolve(server);
        });
      }
    } catch (error) {
      logger.error(`[WebDAV] Server failed to start: ${error.message}`);
      reject(error);
    }
  });
}

module.exports = {
  startWebDAVServer
};
