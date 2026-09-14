const express = require('express');
const router = express.Router();
const authService = require('./auth.service.js');
const logger = require('../utils/logger.js');
const { requireAuth, optionalAuth } = require('./auth.middleware.js');
const config = require('../config.js');

// POST /api/auth/setup
router.post('/setup', async (req, res) => {
  try {
    const { username, password } = req.body;
    const isComplete = await authService.isSetupComplete();
    
    if (isComplete) {
      return res.status(400).json({ error: 'Configurazione iniziale già completata.' });
    }
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password sono richiesti.' });
    }
    
    await authService.setupUser(username, password);
    res.json({ message: 'Setup completato con successo.' });
  } catch (err) {
    logger.error('Errore durante il setup:', err);
    res.status(500).json({ error: 'Errore interno del server durante il setup.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password sono richiesti.' });
    }

    const user = await authService.validateCredentials(username, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Credenziali non valide.' });
    }
    
    const accessToken = authService.generateAccessToken(user);
    const refreshToken = await authService.generateRefreshToken(user.id);
    
    // Cookie per il refresh token
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // approx 30 giorni
    });
    
    res.json({ accessToken });
  } catch (err) {
    logger.error('Errore durante il login:', err);
    res.status(500).json({ error: 'Errore interno del server durante il login.' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Token di aggiornamento (refresh) mancante.' });
    }
    
    const user = await authService.validateRefreshToken(refreshToken);
    if (!user) {
      return res.status(401).json({ error: 'Token di aggiornamento non valido o revocato.' });
    }
    
    const accessToken = authService.generateAccessToken(user);
    res.json({ accessToken });
  } catch (err) {
    logger.error('Errore durante il refresh del token:', err);
    res.status(500).json({ error: 'Errore interno del server durante il refresh.' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }
    
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.json({ message: 'Logout completato con successo.' });
  } catch (err) {
    logger.error('Errore durante il logout:', err);
    res.status(500).json({ error: 'Errore interno del server durante il logout.' });
  }
});

// PUT /api/auth/password
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Password attuale e nuova password sono richieste.' });
    }
    
    await authService.changePassword(req.user.id, oldPassword, newPassword);
    
    // Revoca il cookie visto che il reset disconnette tutti i token
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.json({ message: 'Password modificata con successo. Effettuare di nuovo il login.' });
  } catch (err) {
    logger.error('Errore durante il cambio password:', err);
    if (err.message === 'Password attuale non valida') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Errore interno del server.' });
  }
});

// GET /api/auth/status
router.get('/status', optionalAuth, async (req, res) => {
  try {
    const isComplete = await authService.isSetupComplete();
    
    res.json({
      setupComplete: isComplete,
      isAuthenticated: !!req.user,
      userId: req.user ? req.user.id : null,
      username: req.user ? req.user.username : null,
      role: req.user ? req.user.role : null
    });
  } catch (err) {
    logger.error('Errore durante il controllo stato:', err);
    res.status(500).json({ error: 'Errore interno del server.' });
  }
});

// GET /api/auth/users (Admin only)
router.get('/users', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato. Solo gli amministratori possono vedere gli utenti.' });
    }
    const users = await authService.getUsers();
    // Non restituire password e token
    const safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role || 'user',
      hasAuthenticator: (u.authenticators && u.authenticators.length > 0)
    }));
    res.json(safeUsers);
  } catch (err) {
    logger.error('Errore nel recupero utenti:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// POST /api/auth/users (Admin only)
router.post('/users', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato. Solo gli amministratori possono creare utenti.' });
    }
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password sono richiesti.' });
    }
    const newUser = await authService.createUser(username, password);
    res.json(newUser);
  } catch (err) {
    logger.error('Errore nella creazione utente:', err);
    res.status(400).json({ error: err.message || 'Impossibile creare utente' });
  }
});

module.exports = router;
