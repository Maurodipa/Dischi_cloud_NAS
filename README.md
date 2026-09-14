# ☁️ Dischi Cloud

**Il tuo cloud personale sicuro** — Un sistema di backup cloud casalingo con interfaccia web, sincronizzazione in tempo reale, autenticazione biometrica (WebAuthn), gestione multi-utente e accesso come disco di rete.

---

## 🚀 Caratteristiche

- **📤 Upload/Download** — Carica file e cartelle tramite browser con drag & drop
- **👥 Multi-Utente & Spazi Isolati** — Ogni utente ha la propria cartella privata inaccessibile agli altri (`/mnt/disk1/CloudData/<username>` su Raspberry o `C:\CloudData\<username>` su PC)
- **👑 Pannello di Amministrazione** — Gestione e creazione nuovi utenti direttamente dalla Dashboard per gli amministratori
- **👆 Autenticazione Biometrica (WebAuthn / Passkeys)** — Accesso rapido e sicuro tramite Impronta Digitale o FaceID su smartphone e PC
- **🔑 Gestione Password** — Possibilità per ciascun utente di modificare la propria password dalla Dashboard
- **🔄 Sync in tempo reale & Alert** — Backup automatico su un secondo disco con monitoraggio dello stato di salute del backup
- **📂 WebDAV Per-Utente** — Monta la tua cartella personale come disco di rete (RaiDrive / Windows / Mac)
- **🔐 Sicurezza** — HTTPS (supporto integrato certificati Tailscale), JWT, bcrypt, rate limiting, cookie httpOnly
- **🌐 Accesso remoto** — Compatibile con Tailscale MagicDNS (`mauro.tail9fa347.ts.net`) e Cloudflare Tunnel
- **📱 Responsive** — Usabile da qualsiasi dispositivo con supporto PWA

---

## 📋 Requisiti

- [Node.js](https://nodejs.org/) 18+ (consigliato 20 LTS)
- Due dischi (primario + backup)
- (Opzionale) [Tailscale](https://tailscale.com/) per accesso remoto HTTPS sicuro con certificato SSL valido

---

## 🍓 Installazione su Raspberry Pi (NAS Autonomo)

Vuoi trasformare il tuo **Raspberry Pi 3** in un NAS sempre acceso per gestire i tuoi dischi senza formattarli e senza dipendere dal PC?
👉 **[Leggi la Guida al Setup per Raspberry Pi](docs/raspberry-pi-setup.md)**

---

## 🛠️ Installazione

### 1. Clona o scarica il progetto

```bash
cd Dischi_cloud_NAS
```

### 2. Installa le dipendenze

```bash
npm install
```

### 3. Configura l'ambiente

```bash
# Copia il template di configurazione
copy .env.example .env

# Modifica .env con i tuoi percorsi disco
notepad .env
```

**Configurazioni importanti in `.env`:**

| Variabile | Default Raspberry Pi (Consigliato) | Default Windows (Test) | Descrizione |
|:---|:---|:---|:---|
| `PRIMARY_DISK` | `/mnt/disk1/CloudData` | `C:/CloudData` | Percorso disco primario (HDD USB) |
| `BACKUP_DISK` | `/mnt/disk2/CloudBackup` | `C:/CloudBackup` | Percorso disco backup (HDD USB) |
| `HTTPS_PORT` | `3443` | `3443` | Porta HTTPS (web UI) |
| `WEBDAV_PORT` | `1900` | `1900` | Porta WebDAV (disco di rete) |
| `MAX_UPLOAD_SIZE` | `1099511627776` | `1099511627776` | Limite upload in bytes (1 TB) |

### 4. Avvia il server (scegli UNA delle due opzioni)

Scegli **una** delle due modalità (il server rimarrà attivo nel terminale; per fermarlo premi `CTRL + C`):

- **Per uso normale / produzione (Consigliato):**
  ```bash
  npm start
  ```
- **Solo se stai modificando il codice (Modalità Sviluppo con auto-ricarica):**
  ```bash
  npm run dev
  ```

### 5. Setup iniziale

1. Apri il browser su `https://192.168.3.240:3443` (o `https://raspberrypi.local:3443`)
2. Al primo avvio verrà creata la configurazione iniziale per l'account **Admin** (`maurodipa`)
3. Configura l'impronta digitale/FaceID se richiesto
4. Dalla Dashboard potrai accedere alla **Gestione Utenti** per creare ulteriori utenti! 🎉

---

## 🌐 Accesso Remoto: Approccio Ibrido (Cloudflare + Tailscale)

Per massimizzare la sicurezza, la velocità e superare i limiti di caricamento, Dischi Cloud utilizza un approccio "ibrido":

### 1. Uso Quotidiano (Browser Web & File < 100 MB) -> Cloudflare Tunnel
Ideale per consultare foto, scaricare documenti o accedere da dispositivi mobili in mobilità senza installare nessuna VPN.

**Configurazione Cloudflare (Zero Trust):**
1. Crea un tunnel in Cloudflare Zero Trust e installa l'agente (`cloudflared`) sul PC Server.
2. In **Published application routes**, crea due rotte:
   - `drive.tuodominio.it` -> `HTTPS://localhost:3443` (Ricordati di attivare **No TLS Verify**)
   - `dav.tuodominio.it` -> `HTTPS://localhost:1900` (Ricordati di attivare **No TLS Verify**)
3. Accedi da qualsiasi browser al mondo all'indirizzo `https://drive.tuodominio.it`.

> ⚠️ **Limiti di Cloudflare:** Il piano gratuito di Cloudflare blocca categoricamente qualsiasi singolo trasferimento HTTP superiore a **100 MB**. Se provi a caricare archivi più grandi dal browser, il caricamento si interromperà in "Errore Rete".

### 2. Trasferimenti Massivi (RaiDrive & File > 100 MB) -> Tailscale
Ideale per caricare interi dischi fissi, archivi zip giganti o file video di svariati GigaByte.

Poiché Tailscale crea una connessione diretta (Peer-to-Peer) tra il tuo PC client e il Server domestico aggirando i proxy pubblici, **non ha alcun limite di trasferimento**.

**Configurazione WebDAV (RaiDrive):**
Per sfruttare questo vantaggio con RaiDrive, configuralo in questo modo:
1. Installa RaiDrive sul PC Client e accertati che Tailscale sia attivo.
2. Aggiungi un nuovo disco **WebDAV**.
3. Compila i campi:
   - **Indirizzo:** `mauro.tail9fa347.ts.net` (il tuo MagicDNS di Tailscale)
   - **Porta:** `1900`
   - **Spunta "HTTPS":** ✅ (Il server possiede i certificati SSL di Tailscale)
   - **Percorso:** `/<nomeutente>` (es. `/maurodipa`)
   - **Account:** Username e Password del tuo account Dischi Cloud.
4. Clicca su **OK** o **Connetti**.

In questo modo il disco di rete (Z:) non passerà per Cloudflare e potrai trasferire file da 50+ GB alla massima velocità della tua rete!

---

## 🔒 Certificati HTTPS Locali

Il server supporta l'aggancio automatico dei certificati generati tramite Tailscale:
```bash
tailscale cert mauro.tail9fa347.ts.net
```
I file `tailscale.crt` e `tailscale.key` salvati nella radice del progetto verranno utilizzati automaticamente dal server per garantire una connessione HTTPS sicura e senza avvisi su dispositivi mobili e WebAuthn.

---

## 📁 Struttura Progetto

```
Dischi_cloud_NAS/
├── server/
│   ├── index.js              # Entry point
│   ├── config.js             # Configurazione
│   ├── auth/                 # Autenticazione (JWT, bcrypt, WebAuthn, admin)
│   ├── files/                # Gestione file (upload, download, list, user scoping)
│   ├── webdav/               # Server WebDAV dinamico per-utente
│   ├── sync/                 # Sync engine in tempo reale + monitoraggio salute
│   ├── security/             # HTTPS, rate limiting, certificati Tailscale
│   └── utils/                # Logger
├── public/                   # Frontend (HTML, CSS, JS, PWA)
├── migrate-multiuser.js      # Script migrazione dati multiutente
├── tailscale.crt / .key      # Certificati Let's Encrypt Tailscale
├── .env                      # Configurazione locale
├── package.json
└── ecosystem.config.js       # Config PM2
```

---

## 📝 Licenza

Uso personale. Non distribuire senza autorizzazione.
