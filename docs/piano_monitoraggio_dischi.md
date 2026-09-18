# Piano di Monitoraggio e Manutenzione dei Dischi

Questo documento descrive la strategia consigliata per mantenere in salute i dischi rigidi collegati al Raspberry Pi e prevenire la perdita di dati.

Essendo il sistema basato su Raspberry Pi 3 con dischi USB formattati in **NTFS**, il piano si divide in 3 livelli di intervento e una procedura operativa in caso di guasto.

---

## Livello 1: Salute Hardware del Disco (S.M.A.R.T.)
I dischi moderni possiedono un sistema di autodiagnostica chiamato S.M.A.R.T. (Self-Monitoring, Analysis and Reporting Technology), che registra settori danneggiati, errori di lettura e usura meccanica.

**Configurazione Attiva sul Sistema:**
- `smartmontools` è installato e gestito dal demone `smartd`.
- **Test Veloce (Short Test):** eseguito automaticamente ogni notte alle 03:00 su tutti i dischi supportati (`sda` e `sdc`).
- **Test Completo (Long Test):** eseguito automaticamente ogni Mercoledì notte alle 02:00.
- **Sistema di Allerta:** in caso di errore, `smartd` invoca `/usr/local/bin/smart-alert.sh` che chiama via webhook locale l'applicazione Dischi Cloud (`https://localhost:3443/api/system/disk-alert`).
  - Viene inviata un'email di emergenza all'amministratore (via Gmail/nodemailer).
  - Compare un bollino rosso 🔴 sulla dashboard per l'utente amministratore (`maurodipa`).
  - Se non risolto, viene inviato un promemoria il mattino successivo alle 09:00.
  - Cliccando su "✓ Risolto" nella dashboard, l'allarme viene archiviato e viene inviata un'email di conferma.

---

## Livello 2: Salute del File System (NTFS)
Poiché i dischi sono formattati in NTFS (il file system proprietario di Windows), Linux utilizza il driver `ntfs-3g` per scriverci, ma non possiede gli strumenti migliori per ripararne in profondità la struttura logica (alberi delle directory, cluster orfani).

**Azione Consigliata (Manuale):**
- **Ogni 6 - 12 mesi**, spegnere in modo sicuro il Raspberry Pi (`sudo poweroff`).
- Scollegare fisicamente i dischi USB (Disk 1 e Disk 2) e collegarli a un PC Windows.
- Eseguire il controllo nativo di Windows:
  1. Aprire "Questo PC".
  2. Cliccare col tasto destro sul disco -> Proprietà.
  3. Andare nella scheda "Strumenti" -> "Controllo errori" -> Cliccare su **Controlla**.
  *(In alternativa, da prompt dei comandi di Windows come Amministratore: `chkdsk X: /f` dove X è la lettera del disco).*

---

## Livello 3: Integrità dei File (Prevenzione Bit-rot)
Il "Bit-rot" è la degradazione silenziosa dei dati magnetici nel tempo. I NAS di fascia altissima (con file system ZFS o BTRFS) controllano l'integrità ricalcolando gli Hash dei file periodicamente.

**Strategia Adottata:**
- Su un hardware limitato come il Raspberry Pi 3 (CPU debole, bus USB 2.0 condiviso), ricalcolare periodicamente l'MD5 o SHA256 di centinaia di Gigabyte di video causerebbe un'usura meccanica eccessiva dei dischi e bloccherebbe le prestazioni del NAS per ore o giorni.
- **Soluzione:** Affidarsi alla ridondanza automatica tra `disk1` e `disk2` gestita dallo script in background (`server/sync/sync.service.js`). Se il disco 1 dovesse presentare corruzioni o blocchi illeggibili, il sistema restituirà un errore di I/O (Input/Output Error), permettendo di recuperare la copia intatta dal disco 2.

---

## Guida Operativa: Cosa Fare in Caso di Allarme Disco

Se ricevi un'email di allerta o vedi il bollino rosso 🔴 sulla dashboard, segui questi passaggi operativi:

### Passo 1: Diagnosi da Terminale SSH
Collegati via SSH al Raspberry Pi e lancia l'analisi completa del disco segnalato nell'allerta:

```bash
sudo smartctl -a /dev/sda
```
*(sostituisci `/dev/sda` con `/dev/sdc` se l'errore riguarda il secondo disco)*

Controlla le seguenti sezioni:
1. **`SMART overall-health self-assessment test result:`**
   - **`PASSED`**: Il disco non è in imminente rottura, ma ha riscontrato un'anomalia o un allarme termico/settore.
   - **`FAILED`**: 🔴 Emergenza. L'elettronica del disco prevede il guasto definitivo entro breve tempo.
2. **Tabella degli attributi S.M.A.R.T. (colonna `RAW_VALUE`):**
   - **`5 Reallocated_Sector_Ct`**: Settori danneggiati riallocati. Se il valore è basso e stabile, il disco può ancora reggere; se aumenta continuamente, sta morendo.
   - **`197 Current_Pending_Sector`**: Settori instabili in attesa di verifica/riallocazione. Spesso riparabili con un controllo approfondito.
   - **`198 Offline_Uncorrectable`**: Settori definitivamente illeggibili.
   - **`194 Temperature_Celsius`**: Temperatura del disco (dovrebbe restare sotto i 50-55°C).

### Passo 2: Verifica della Copia di Sicurezza
I due dischi lavorano in sincronia continua:
- Se il disco in errore è `disk1`, il backup integro è su `disk2` (e viceversa).
- Per i file critici, puoi effettuare un'ulteriore copia rapida sul PC tramite RaiDrive o interfaccia web prima di intervenire fisicamente.

### Passo 3: Tentativo di Riparazione Logica (su PC Windows)
Spesso i settori in attesa ("Pending Sectors") derivano da interruzioni di corrente o scritture incomplete:
1. Spegni il Raspberry Pi in sicurezza:
   ```bash
   sudo poweroff
   ```
2. Scollega il cavo USB del disco problematico e collegalo a un PC Windows.
3. Apri il Prompt dei comandi di Windows come Amministratore ed esegui:
   ```cmd
   chkdsk X: /f /r
   ```
   *(sostituisci `X:` con la lettera assegnata da Windows al disco. Il parametro `/r` scansiona la superficie e recupera/isola i settori difettosi).*
4. Ricollega il disco al Raspberry Pi e riaccendilo.

### Passo 4: Sostituzione del Disco (in caso di guasto hardware)
Se il disco continua a dare `FAILED` o i settori riallocati crescono a dismisura:
1. Spegni il Raspberry (`sudo poweroff`).
2. Rimuovi il disco guasto.
3. Formatta un nuovo hard disk in NTFS su Windows, assegnando la stessa etichetta (`disk1` o `disk2`).
4. Collegalo al Raspberry Pi.
5. Ripristina i dati copiandoli dal disco sano rimasto attivo (tramite il servizio di sync o comando `cp -r`).

### Passo 5: Risoluzione dell'Allerta
1. Accedi alla dashboard come utente amministratore (`maurodipa`).
2. Clicca sul pulsante **`✓ Risolto`** accanto al bollino rosso.
3. Il bollino scomparirà e riceverai l'email di conferma con l'orario e l'utente che ha archiviato l'intervento.
