# Guida ai Comandi Utili di Manutenzione (Raspberry Pi NAS)

Questa guida raccoglie i comandi SSH più utili per la gestione, la manutenzione preventiva e la risoluzione dei problemi sul Raspberry Pi NAS.

---

## 1. Monitoraggio Hardware e Risorse di Sistema

- **Misurare la temperatura attuale della CPU:**
  ```bash
  vcgencmd measure_temp
  ```
  *Mostra la temperatura istantanea del chip del Raspberry (ideale mantenerla sotto i 60-65°C).*

- **Verificare problemi di alimentazione (Under-voltage) e surriscaldamento (Throttling):**
  ```bash
  vcgencmd get_throttled
  ```
  *È il comando diagnostico più importante. Significati:*
  * `0x0`: Tutto perfetto.
  * `0x50000` / `0x50005`: **Under-voltage (Alimentazione insufficiente)** in passato o attuale. L'alimentatore non fornisce abbastanza corrente, grave rischio per i dischi.
  * `0x?0002` / `0x?0008`: Surriscaldamento.

- **Misurare il voltaggio attuale fornito al core:**
  ```bash
  vcgencmd measure_volts core
  ```
  *Mostra il voltaggio istantaneo del processore (di base attorno a 1.2V).*

- **Cercare avvisi di calo di tensione nei log del Kernel:**
  ```bash
  sudo dmesg | grep -i undervoltage
  ```
  *Se restituisce `Undervoltage detected!` seguito da `Voltage normalised`, l'alimentatore ha avuto un calo di potenza. Se succede solo nei primi 15-20 secondi di avvio è dovuto al picco di assorbimento dei dischi meccanici che si accendono (spin-up). Se succede durante l'uso normale, l'alimentatore va sostituito.*

- **Cercare avvisi di calo di tensione nello storico di sistema:**
  ```bash
  sudo journalctl -k | grep -i "undervoltage"
  ```
  *Permette di vedere se ci sono stati cali di tensione nei giorni passati o in sessioni precedenti.*

- **Vedere la memoria RAM utilizzata e disponibile:**
  ```bash
  free -h
  ```
  *Mostra la RAM usata, libera e la memoria di Swap attualmente in uso.*

- **Controllare lo spazio totale occupato e disponibile su tutti i dischi montati:**
  ```bash
  df -h / /mnt/disk1 /mnt/disk2
  ```
  *Visualizza la capienza e la percentuale di riempimento della memoria di sistema, del Disco 1 e del Disco 2.*

---

## 2. Diagnosi e Salute dei Dischi (S.M.A.R.T.)

- **Vedere la tabella d'integrità hardware S.M.A.R.T. di un disco:**
  ```bash
  sudo smartctl -a /dev/sda
  ```
  *Sostituisci `sda` con `sdc` per il secondo disco. Mostra lo stato di salute e i settori danneggiati.*

- **Lanciare un test hardware rapido (Short Test) su un disco:**
  ```bash
  sudo smartctl -t short /dev/sda
  ```
  *Avvia un controllo veloce (circa 2 minuti) sulla meccanica ed elettronica del disco.*

- **Leggere l'esito dell'ultimo test S.M.A.R.T. eseguito:**
  ```bash
  sudo smartctl -l selftest /dev/sda
  ```
  *Mostra lo storico dei test automatici (Short e Long) eseguiti da `smartd` con eventuale percentuale di successo.*

- **Verificare lo stato del servizio di monitoraggio dischi `smartd`:**
  ```bash
  sudo systemctl status smartmontools
  ```
  *Verifica che il demone di sorveglianza dischi sia attivo e in esecuzione.*

---

## 3. Spazio Occupato e Confronto Cartelle Utenti

- **Vedere lo spazio occupato da ciascun utente sul Disco 1 (Principale):**
  ```bash
  sudo du -sh /mnt/disk1/CloudData/*
  ```
  *Elenca le cartelle di tutti gli utenti in Gigabyte (`G`) o Megabyte (`M`).*

- **Vedere lo spazio occupato da ciascun utente sul Disco 2 (Backup):**
  ```bash
  sudo du -sh /mnt/disk2/CloudBackup/*
  ```
  *Elenca lo spazio di backup occupato sul secondo disco per ogni utente.*

- **Confrontare il numero esatto di Byte occupati da un utente su entrambi i dischi:**
  ```bash
  sudo du -sb /mnt/disk1/CloudData/maurodipa /mnt/disk2/CloudBackup/maurodipa
  ```
  *Mostra i byte esatti (senza arrotondamenti) per verificare la parità tra i due dischi.*

- **Trovare i file differenti o mancanti tra Disco 1 e Disco 2 (Simulazione veloce):**
  ```bash
  rsync -rvn --size-only --delete /mnt/disk1/CloudData/ /mnt/disk2/CloudBackup/
  ```
  *Simula il confronto (con `-n` non cancella o modifica nulla) e mostra a schermo solo i file non sincronizzati.*

---

## 4. Analisi dei Log e Attività degli Utenti

- **Consultare gli ultimi eventi e gli accessi degli utenti all'applicazione:**
  ```bash
  tail -n 100 ~/Dischi_cloud_NAS/logs/dischi-cloud.log
  ```
  *Legge le ultime 100 righe del log di Winston (contiene login, upload, operazioni sui file e notifiche).*

- **Cercare tutti i tentativi di login o gli accessi di un utente specifico:**
  ```bash
  grep "maurodipa" ~/Dischi_cloud_NAS/logs/dischi-cloud.log | tail -n 50
  ```
  *Filtra il log dell'applicazione e mostra solo gli ultimi 50 eventi legati a quell'utente.*

- **Visualizzare gli ultimi messaggi del servizio di sincronizzazione `lsyncd`:**
  ```bash
  tail -n 50 /var/log/lsyncd/lsyncd.log
  ```
  *Mostra l'attività recente del demone di mirroring in tempo reale.*

- **Vedere lo stato ufficiale dell'ultima sincronizzazione `lsyncd`:**
  ```bash
  cat /var/log/lsyncd/lsyncd.status
  ```
  *Stampa il report di stato con i ritardi accumulati (delays) e l'orario dell'ultima sincronizzazione riuscita.*

---

## 5. Gestione dei Servizi di Background

- **Controllare lo stato dell'applicazione Node.js (Dischi Cloud):**
  ```bash
  pm2 status
  ```
  *Mostra se il server Node.js è online, l'uso di CPU, memoria e il numero di riavvii.*

- **Leggere i log degli errori in tempo reale dell'App:**
  ```bash
  pm2 logs dischi-cloud --lines 50
  ```
  *Mostra gli errori generati live dall'applicazione web.*

- **Riavviare l'applicazione Dischi Cloud:**
  ```bash
  pm2 restart all
  ```
  *Applica modifiche al file `.env` o riavvia il server web.*

- **Controllare lo stato del servizio di sincronizzazione `lsyncd`:**
  ```bash
  sudo systemctl status lsyncd --no-pager
  ```
  *Verifica che il servizio di mirroring tra i due dischi stia girando regolarmente.*

- **Riavviare il servizio `lsyncd`:**
  ```bash
  sudo systemctl restart lsyncd
  ```
  *Forza un riavvio del demone di sincronizzazione.*

---

## 6. Spegnimento e Riavvio del Sistema

- **Spegnere in modo sicuro il Raspberry Pi:**
  ```bash
  sudo shutdown -h now
  ```
  *(oppure `sudo poweroff`)*
  *ATTENZIONE: Aspetta 10-15 secondi che il LED verde sul Raspberry Pi smetta di lampeggiare e rimanga acceso solo il LED rosso prima di staccare il cavo di alimentazione. Questo evita la corruzione dei dati.*

- **Riavviare il Raspberry Pi:**
  ```bash
  sudo reboot
  ```
  *Esegue un riavvio pulito del sistema.*
