# Piano di Monitoraggio e Manutenzione dei Dischi

Questo documento descrive la strategia consigliata per mantenere in salute i dischi rigidi collegati al Raspberry Pi e prevenire la perdita di dati.

Essendo il sistema basato su Raspberry Pi 3 con dischi USB formattati in **NTFS**, il piano si divide in 3 livelli di intervento:

---

## Livello 1: Salute Hardware del Disco (S.M.A.R.T.)
I dischi moderni possiedono un sistema di autodiagnostica chiamato S.M.A.R.T. (Self-Monitoring, Analysis and Reporting Technology), che registra settori danneggiati, errori di lettura e usura meccanica.

**Azione Consigliata:**
- Installare `smartmontools` sul Raspberry Pi: `sudo apt install smartmontools`
- Configurare il demone `smartd` per eseguire:
  - Un test rapido (Short Test) ogni notte.
  - Un test approfondito (Long Test) una volta alla settimana.
- Monitorare periodicamente i log di sistema o configurare un avviso per identificare i dischi "Failing" prima che si rompano definitivamente.

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
  *(In alternativa, da prompt dei comandi di Windows: `chkdsk X: /f` dove X è la lettera del disco).*

---

## Livello 3: Integrità dei File (Prevenzione Bit-rot)
Il "Bit-rot" è la degradazione silenziosa dei dati magnetici nel tempo. I NAS di fascia altissima (con file system ZFS o BTRFS) controllano l'integrità ricalcolando gli Hash dei file periodicamente.

**Strategia Adottata:**
- Su un hardware limitato come il Raspberry Pi 3 (CPU debole, bus USB 2.0 condiviso), ricalcolare periodicamente l'MD5 o SHA256 di centinaia di Gigabyte di video causerebbe un'usura meccanica eccessiva dei dischi e bloccherebbe le prestazioni del NAS per ore o giorni.
- **Soluzione:** Affidarsi esclusivamente alla ridondanza (la sincronizzazione automatica tra `disk1` e `disk2` gestita dallo script in background). Se il disco 1 dovesse presentare corruzioni illeggibili, il sistema restituirà un errore di I/O (Input/Output Error), segnalandoci il problema e permettendoci di recuperare la copia intatta dal disco 2.
