const express = require('express');
const { 
  generateRegistrationOptions, 
  verifyRegistrationResponse, 
  generateAuthenticationOptions, 
  verifyAuthenticationResponse 
} = require('@simplewebauthn/server');
const authService = require('./auth.service');
const { requireAuth } = require('./auth.middleware');
const logger = require('../utils/logger');

const router = express.Router();

const rpName = 'Dischi Cloud';

const getOrigin = (req) => {
  return `${req.protocol}://${req.get('host')}`;
};

// --- Check if user has registered passkeys ---
router.get('/has-passkey', async (req, res) => {
  try {
    const users = await authService.getUsers();
    if (users.length === 0) return res.json({ hasPasskey: false });
    const user = users[0];
    const has = (user.authenticators || []).length > 0;
    return res.json({ hasPasskey: has });
  } catch (error) {
    logger.error(`[WebAuthn] has-passkey error: ${error.message}`);
    res.json({ hasPasskey: false });
  }
});

// --- REGISTRATION ---
// 1. Generate options for a logged-in user
router.get('/register/generate-options', requireAuth, async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userAuthenticators = user.authenticators || [];

    const options = await generateRegistrationOptions({
      rpName,
      rpID: req.hostname,
      userID: new Uint8Array(Buffer.from(user.id)),
      userName: user.username,
      excludeCredentials: userAuthenticators.map(auth => ({
        id: auth.credentialID,
        type: 'public-key',
        transports: auth.transports,
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    await authService.updateUser(user.id, { currentChallenge: options.challenge });

    logger.info(`[WebAuthn] Registration options generated for user: ${user.username}`);
    res.json(options);
  } catch (error) {
    logger.error(`[WebAuthn] Registration generate error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 2. Verify registration response (v14 API)
router.post('/register/verify', requireAuth, async (req, res) => {
  const { body } = req;
  try {
    const user = await authService.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const expectedChallenge = user.currentChallenge;
    
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: getOrigin(req),
        expectedRPID: req.hostname,
      });
    } catch (error) {
      logger.error(`[WebAuthn] Registration verify error: ${error.message}`);
      return res.status(400).json({ error: error.message });
    }

    const { verified, registrationInfo } = verification;
    
    if (verified && registrationInfo) {
      // v14 API: registrationInfo.credential contains { id, publicKey, counter, transports }
      const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
      
      const newAuthenticator = {
        credentialID: credential.id,
        credentialPublicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        credentialDeviceType,
        credentialBackedUp,
        transports: credential.transports || body.response.transports,
      };

      await authService.addAuthenticator(user.id, newAuthenticator);
      await authService.updateUser(user.id, { currentChallenge: null });

      logger.info(`[WebAuthn] Passkey registered successfully for user: ${user.username}`);
      return res.json({ verified: true });
    }
    
    res.status(400).json({ error: 'Verification failed' });
  } catch (error) {
    logger.error(`[WebAuthn] Registration error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});


// --- AUTHENTICATION ---
// 1. Generate options for login
router.post('/login/generate-options', async (req, res) => {
  try {
    const users = await authService.getUsers();
    if (users.length === 0) {
      return res.status(404).json({ error: 'Nessun utente configurato' });
    }
    
    // Single-user system: always use the first user
    const user = users[0];
    const userAuthenticators = user.authenticators || [];

    if (userAuthenticators.length === 0) {
      return res.status(400).json({ error: 'Nessuna impronta registrata' });
    }

    const options = await generateAuthenticationOptions({
      rpID: req.hostname,
      allowCredentials: userAuthenticators.map(auth => ({
        id: auth.credentialID,
        type: 'public-key',
        transports: auth.transports,
      })),
      userVerification: 'preferred',
    });

    await authService.updateUser(user.id, { currentChallenge: options.challenge });

    logger.info(`[WebAuthn] Auth options generated for user: ${user.username}`);
    res.json(options);
  } catch (error) {
    logger.error(`[WebAuthn] Auth generate error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 2. Verify authentication response
router.post('/login/verify', async (req, res) => {
  const { body } = req;
  try {
    const users = await authService.getUsers();
    let user = null;
    let authenticator = null;

    for (const u of users) {
      const auth = (u.authenticators || []).find(
        a => a.credentialID === body.id
      );
      if (auth) {
        user = u;
        authenticator = auth;
        break;
      }
    }

    if (!user || !authenticator) {
      logger.error(`[WebAuthn] Authenticator not found for credential ID: ${body.id}`);
      return res.status(400).json({ error: 'Impronta non riconosciuta' });
    }

    const expectedChallenge = user.currentChallenge;

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: getOrigin(req),
        expectedRPID: req.hostname,
        credential: {
          id: authenticator.credentialID,
          publicKey: Buffer.from(authenticator.credentialPublicKey, 'base64url'),
          counter: authenticator.counter,
          transports: authenticator.transports,
        },
      });
    } catch (error) {
      logger.error(`[WebAuthn] Auth verify error: ${error.message}`);
      return res.status(400).json({ error: error.message });
    }

    const { verified, authenticationInfo } = verification;
    
    if (verified) {
      // Update counter
      await authService.updateAuthenticatorCounter(user.id, authenticator.credentialID, authenticationInfo.newCounter);
      await authService.updateUser(user.id, { currentChallenge: null });

      // Generate JWT tokens (pass user.id, not the whole user object)
      const accessToken = authService.generateAccessToken(user);
      const refreshToken = await authService.generateRefreshToken(user.id);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: req.secure || req.protocol === 'https',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 giorni
      });

      logger.info(`[WebAuthn] Login successful for user: ${user.username}`);
      return res.json({
        verified: true,
        accessToken,
        user: { id: user.id, username: user.username }
      });
    }

    res.status(400).json({ error: 'Verifica fallita' });
  } catch (error) {
    logger.error(`[WebAuthn] Login error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
