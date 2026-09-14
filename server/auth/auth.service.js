const fs = require('fs-extra');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config.js');
const logger = require('../utils/logger.js');

const USERS_FILE = path.join(config.primaryDisk, '.dischi-cloud', 'users.json');

// Assicura che il file degli utenti e la cartella esistano
async function ensureUsersFile() {
  if (!await fs.pathExists(USERS_FILE)) {
    await fs.ensureDir(path.dirname(USERS_FILE));
    await fs.writeJson(USERS_FILE, []);
  }
}

// Legge il file degli utenti
async function getUsers() {
  await ensureUsersFile();
  try {
    return await fs.readJson(USERS_FILE);
  } catch (err) {
    logger.error('Errore nella lettura di users.json', err);
    return [];
  }
}

// Salva il file degli utenti
async function saveUsers(users) {
  await ensureUsersFile();
  await fs.writeJson(USERS_FILE, users, { spaces: 2 });
}

// Verifica se c'è almeno un utente
async function isSetupComplete() {
  const users = await getUsers();
  return users.length > 0;
}

// Crea il primo utente
async function setupUser(username, password) {
  const users = await getUsers();
  if (users.length > 0) {
    throw new Error('Configurazione già completata. Esiste già un utente.');
  }
  
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(password, salt);
  
  const newUser = {
    id: uuidv4(),
    username,
    password: hashedPassword,
    role: 'admin',
    refreshTokens: [],
    authenticators: []
  };
  
  users.push(newUser);
  await saveUsers(users);
  logger.info(`Primo utente creato con successo: ${username}`);
  return newUser.id;
}

// Crea un nuovo utente (da parte di admin)
async function createUser(username, password) {
  const users = await getUsers();
  if (users.find(u => u.username === username)) {
    throw new Error('Username già esistente.');
  }
  
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(password, salt);
  
  const newUser = {
    id: uuidv4(),
    username,
    password: hashedPassword,
    role: 'user',
    refreshTokens: [],
    authenticators: []
  };
  
  users.push(newUser);
  await saveUsers(users);
  
  // Crea la cartella utente
  const userDir = path.join(config.primaryDisk, username);
  await fs.ensureDir(userDir);
  
  return { id: newUser.id, username: newUser.username, role: newUser.role };
}

async function getUserById(id) {
  const users = await getUsers();
  return users.find(u => u.id === id);
}

async function getUserByUsername(username) {
  const users = await getUsers();
  return users.find(u => u.username === username);
}

async function updateUser(id, updates) {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.id === id);
  if (userIndex === -1) return null;
  users[userIndex] = { ...users[userIndex], ...updates };
  await saveUsers(users);
  return users[userIndex];
}

async function addAuthenticator(userId, authenticator) {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) return null;
  
  if (!users[userIndex].authenticators) {
    users[userIndex].authenticators = [];
  }
  users[userIndex].authenticators.push(authenticator);
  await saveUsers(users);
  return users[userIndex];
}

async function updateAuthenticatorCounter(userId, credentialID, newCounter) {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) return null;
  
  const authIndex = (users[userIndex].authenticators || []).findIndex(
    a => a.credentialID === credentialID
  );
  if (authIndex !== -1) {
    users[userIndex].authenticators[authIndex].counter = newCounter;
    await saveUsers(users);
  }
}

// Valida username e password per il login
async function validateCredentials(username, password) {
  const users = await getUsers();
  const user = users.find(u => u.username === username);
  if (!user) return null;
  
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return null;
  
  return user;
}

// Genera un token JWT di accesso
function generateAccessToken(user) {
  return jwt.sign(
    { 
      id: user.id,
      username: user.username,
      role: user.role || 'user'
    }, 
    config.jwtSecret, 
    { expiresIn: config.accessTokenExpiry || '15m' }
  );
}

// Genera un refresh token e lo salva nel JSON dell'utente
async function generateRefreshToken(userId) {
  const token = uuidv4();
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) throw new Error('Utente non trovato');
  
  if (!users[userIndex].refreshTokens) {
    users[userIndex].refreshTokens = [];
  }
  
  users[userIndex].refreshTokens.push(token);
  await saveUsers(users);
  return token;
}

// Valida un refresh token e restituisce l'utente se valido
async function validateRefreshToken(token) {
  const users = await getUsers();
  const user = users.find(u => u.refreshTokens && u.refreshTokens.includes(token));
  return user || null;
}

// Revoca (rimuove) un refresh token specifico
async function revokeRefreshToken(token) {
  const users = await getUsers();
  let updated = false;
  
  for (let i = 0; i < users.length; i++) {
    if (users[i].refreshTokens && users[i].refreshTokens.includes(token)) {
      users[i].refreshTokens = users[i].refreshTokens.filter(t => t !== token);
      updated = true;
    }
  }
  
  if (updated) {
    await saveUsers(users);
  }
}

// Cambia la password dell'utente
async function changePassword(userId, oldPassword, newPassword) {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) throw new Error('Utente non trovato');
  
  const isValid = await bcrypt.compare(oldPassword, users[userIndex].password);
  if (!isValid) {
    throw new Error('Password attuale non valida');
  }
  
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  
  users[userIndex].password = hashedPassword;
  // Per sicurezza, disconnettiamo l'utente da tutti i dispositivi invalidando i refresh token
  users[userIndex].refreshTokens = [];
  
  await saveUsers(users);
  logger.info(`Password modificata per utente ID: ${userId}`);
}

module.exports = {
  isSetupComplete,
  setupUser,
  validateCredentials,
  generateAccessToken,
  generateRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  changePassword,
  updateUser,
  addAuthenticator,
  updateAuthenticatorCounter,
  createUser,
  getUserById,
  getUserByUsername,
  getUsers
};
