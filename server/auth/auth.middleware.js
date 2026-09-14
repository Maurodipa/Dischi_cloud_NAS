const jwt = require('jsonwebtoken');
const config = require('../config.js');
const logger = require('../utils/logger.js');

// Estrae il token da Authorization header (Bearer) o dai cookie (access_token)
function extractToken(req) {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }
  if (req.query && req.query.token) {
    return req.query.token;
  }
  return null;
}

// Middleware di autenticazione obbligatoria
function requireAuth(req, res, next) {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'Accesso negato. Token di autenticazione mancante.' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded; // { id: userId, iat, exp }
    next();
  } catch (err) {
    logger.warn(`Tentativo di accesso con token non valido: ${err.message}`);
    return res.status(401).json({ error: 'Accesso negato. Token non valido o scaduto.' });
  }
}

// Middleware di autenticazione opzionale (non blocca se il token non c'è o è invalido)
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  
  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.user = decoded;
    } catch (err) {
      // Ignora l'errore per auth opzionale, l'utente sarà null o undefined
      logger.debug(`Token opzionale non valido ignorato: ${err.message}`);
    }
  }
  
  next();
}

module.exports = {
  requireAuth,
  optionalAuth
};
