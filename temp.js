
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW setup failed', err));
      });
    }
  

    document.addEventListener('DOMContentLoaded', async () => {
      const setupSection = document.getElementById('setup-section');
      const loginSection = document.getElementById('login-section');
      const loadingSection = document.getElementById('loading-section');

      try {
        const status = await getAuthStatus();
        
        if (!status) {
          loadingSection.innerHTML = '<p style="text-align:center; color:#e94560;">Errore di connessione al server.</p>';
          return;
        }

        loadingSection.style.display = 'none';

        if (status.isAuthenticated) {
          window.location.href = '/dashboard.html';
          return;
        }

        if (status.setupComplete) {
          const refreshed = await refreshToken();
          if (refreshed) {
            window.location.href = '/dashboard.html';
            return;
          }
          loginSection.style.display = 'block';
        } else {
          setupSection.style.display = 'block';
        }
      } catch (err) {
        console.error('Errore controllo stato:', err);
        loadingSection.innerHTML = '<p style="text-align:center; color:#e94560;">Errore di connessione al server.</p>';
      }

      // === Setup form handler ===
      document.getElementById('setup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('setup-username').value.trim();
        const password = document.getElementById('setup-password').value;
        const confirmPassword = document.getElementById('setup-password-confirm').value;

        if (password !== confirmPassword) {
          showToast('Le password non coincidono', 'error');
          return;
        }

        if (password.length < 6) {
          showToast('La password deve avere almeno 6 caratteri', 'error');
          return;
        }

        try {
          const res = await fetch('/api/auth/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          const data = await res.json();

          if (res.ok) {
            showToast('Account creato! Effettua il login.', 'success');
            setupSection.style.display = 'none';
            loginSection.style.display = 'block';
            document.getElementById('username').value = username;
            document.getElementById('password').focus();
          } else {
            showToast(data.error || 'Errore durante la creazione', 'error');
          }
        } catch (err) {
          console.error('Setup error:', err);
          showToast('Errore di connessione al server', 'error');
        }
      });

      // === WebAuthn Logic ===
      let browserSupportsWebAuthn = () => false;
      let startRegistration = null;
      let startAuthentication = null;

      if (window.SimpleWebAuthnBrowser) {
        browserSupportsWebAuthn = window.SimpleWebAuthnBrowser.browserSupportsWebAuthn;
        startRegistration = window.SimpleWebAuthnBrowser.startRegistration;
        startAuthentication = window.SimpleWebAuthnBrowser.startAuthentication;
      }

      // Mostra il pulsante se il browser supporta WebAuthn
      if (browserSupportsWebAuthn()) {
        const btnBiometric = document.getElementById('btn-biometric');
        btnBiometric.style.display = 'block';

        btnBiometric.addEventListener('click', async () => {
          try {
            const resp = await fetch('/api/auth/webauthn/login/generate-options', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({})
            });
            const options = await resp.json();
            
            if (options.error) {
              return showToast(options.error, 'error');
            }

            const asseResp = await startAuthentication(options);

            const verificationResp = await fetch('/api/auth/webauthn/login/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(asseResp),
            });

            const verificationJSON = await verificationResp.json();

            if (verificationJSON && verificationJSON.verified) {
              window.location.href = '/dashboard.html';
            } else {
              showToast('Accesso biometrico fallito.', 'error');
            }
          } catch (error) {
            console.error('WebAuthn error:', error);
            if (error.name !== 'NotAllowedError') {
              showToast('Nessuna impronta registrata o errore.', 'error');
            }
          }
        });
      }

      async function offerBiometricRegistration() {
        if (!browserSupportsWebAuthn()) return;
        
        try {
          const resp = await fetch('/api/auth/webauthn/register/generate-options', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const options = await resp.json();
          if (options.error) return;

          if (confirm('Vuoi abilitare l\'accesso rapido con impronta digitale/FaceID su questo dispositivo?')) {
            const attResp = await startRegistration(options);
            
            const verificationResp = await fetch('/api/auth/webauthn/register/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify(attResp),
            });
            
            const verificationJSON = await verificationResp.json();
            if (verificationJSON && verificationJSON.verified) {
              showToast('Accesso con impronta configurato con successo!', 'success');
            } else {
              showToast('Errore durante la configurazione.', 'error');
            }
          }
        } catch (error) {
          console.error('Registration error:', error);
          if (error.name !== 'NotAllowedError') {
            showToast('Impossibile configurare l\'impronta.', 'error');
          }
        }
      }

      // === Login form handler ===
      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;

        if (!user || !pass) {
          showToast('Inserisci nome utente e password', 'error');
          return;
        }

        const success = await login(user, pass);
        if (success) {
          // Offri di registrare l'impronta dopo il login con password
          await offerBiometricRegistration();
          window.location.href = '/dashboard.html';
        } else {
          showToast('Credenziali non valide', 'error');
        }
      });
    });
  