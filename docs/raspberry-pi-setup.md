# Guida al Setup di Dischi Cloud su Raspberry Pi 3

Questa guida ti accompagnerà passo-passo nella trasformazione del tuo Raspberry Pi 3 in un NAS autonomo per il tuo progetto Dischi Cloud, utilizzando i tuoi due dischi rigidi **senza formattarli** e senza perdere alcun dato.

## 1. Preparazione del Raspberry Pi 3

1. Scarica e installa **Raspberry Pi Imager** sul tuo PC.
2. Inserisci la scheda MicroSD nel PC.
3. Su Raspberry Pi Imager, seleziona:
   - **OS:** Raspberry Pi OS (Legacy, 64-bit) Lite oppure Raspberry Pi OS Lite (senza interfaccia desktop, per risparmiare risorse).
   - **Storage:** La tua scheda MicroSD.
   - ⚙️ **Impostazioni avanzate (ingranaggio):**
     - Abilita l'SSH.
     - Imposta un nome utente (es. `pi`) e una password.
     - Imposta il Wi-Fi (sebbene sia raccomandato usare il cavo Ethernet).
4. Scrivi l'OS sulla MicroSD, inseriscila nel Raspberry Pi 3, collegalo al router tramite cavo Ethernet e accendilo.

## 2. Collegamento remoto tramite PC

Dal tuo PC Windows, apri il Terminale o PowerShell e collegati al Raspberry:

```bash
ssh pi@raspberrypi.local
# (sostituisci "raspberrypi.local" con l'IP del Raspberry se non funziona)
```

Una volta entrato, aggiorna il sistema:

```bash
sudo apt update && sudo apt upgrade -y
```

## 3. Montare i dischi (SENZA formattare)

Dato che i tuoi dischi venivano usati su Windows, molto probabilmente sono formattati in **NTFS** o **exFAT**. Per leggerli e scriverli correttamente su Linux senza perdere dati, dobbiamo installare i driver adatti:

```bash
sudo apt install ntfs-3g exfat-fuse -y
```

### Identificare i dischi
Collega entrambi i dischi alle porte USB del Raspberry Pi. (Il disco autoalimentato accendilo normalmente; l'HDD alimentato da USB prenderà corrente dal Raspberry).

Ora, identifica i dischi con il comando:

```bash
sudo blkid
```

Vedrai un output con varie voci. Cerca i tuoi due dischi (spesso si chiamano `/dev/sda1` e `/dev/sdb1`). 
Annota l'**UUID** e il **TYPE** (es. `ntfs` o `exfat`) di ciascun disco.
Esempio: `/dev/sda1: UUID="1A2B3C4D5E6F7G8H" TYPE="ntfs"`

### Creare le cartelle di destinazione (Mount Points)
Crea le cartelle in cui "appariranno" i file dei dischi:

```bash
sudo mkdir -p /mnt/disk1
sudo mkdir -p /mnt/disk2
```

### Configurare l'avvio automatico dei dischi (fstab)
Per far sì che i dischi vengano letti in automatico ad ogni riavvio:

```bash
sudo nano /etc/fstab
```

Aggiungi alla fine del file due righe simili a queste (sostituisci l'UUID con i tuoi). Assicurati di usare `uid=1000,gid=1000` (che corrisponde all'utente `pi`) per non avere problemi di permessi con Node.js:

**Se il disco è NTFS:**
```text
UUID=IL_TUO_UUID_1 /mnt/disk1 ntfs-3g defaults,auto,uid=1000,gid=1000,umask=000 0 0
```

**Se il disco è exFAT:**
```text
UUID=IL_TUO_UUID_1 /mnt/disk1 exfat defaults,auto,uid=1000,gid=1000,umask=000 0 0
```

Salva (CTRL+O, Invio) ed esci (CTRL+X).
Ora monta i dischi immediatamente per testare:

```bash
sudo mount -a
```

Verifica che i tuoi vecchi file siano intatti digitando:
```bash
ls -la /mnt/disk1
ls -la /mnt/disk2
```
Troverai le tue vecchie cartelle!

## 4. Installare Node.js e Git

Installa Node.js 20 (versione raccomandata):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
```

## 5. Avviare "Dischi Cloud"

Scarica il tuo progetto sul Raspberry o copialo tramite SCP/SFTP. Se hai il progetto su un repository GitHub:

```bash
git clone <URL_DEL_TUO_REPO> Dischi_cloud_NAS
cd Dischi_cloud_NAS
npm install
```

Configura l'ambiente copiando il file d'esempio:

```bash
cp .env.example .env
nano .env
```

Modifica i percorsi per puntare ai dischi del Raspberry:
```env
PRIMARY_DISK=/mnt/disk1/CloudData
BACKUP_DISK=/mnt/disk2/CloudBackup
```
*(Se le cartelle `CloudData` e `CloudBackup` non esistono sui dischi, il server Node le creerà automaticamente).*

### Mantenere il server sempre acceso con PM2

Per fare in modo che il NAS continui a funzionare anche se chiudi la finestra del terminale SSH, e che si avvii da solo se manca la corrente, usa **PM2**:

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```
Copia e incolla il comando suggerito in output da `pm2 startup` per completare l'autostart.

---

**Finito!** 🎉 Il tuo Raspberry Pi 3 è ora un NAS autonomo. Potrai accedere all'interfaccia web dal tuo PC usando l'indirizzo IP del Raspberry Pi (es. `https://192.168.1.xxx:3443`). I dischi non sono stati formattati e i tuoi vecchi file utente (sotto `CloudData/NomeUtente`) riprenderanno a sincronizzarsi e funzionare esattamente come prima!
