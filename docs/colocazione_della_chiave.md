# Co-location della Chiave Crittografica (Limite della Server-Side Encryption)

Questo documento spiega il concetto di **co-location della chiave** in un sistema di Server-Side Encryption (SSE) e i relativi modelli di minaccia.

---

## 1. Cos'è la Co-location della Chiave?

La **co-location** si verifica quando la chiave di cifratura (`ENCRYPTION_MASTER_KEY` nel file `.env`) risiede fisicamente sullo stesso dispositivo o sullo stesso ambiente di archiviazione in cui si trovano i dati cifrati.

```
Dispositivo Raspberry Pi:
┌─────────────────────────────────────────────────────────────┐
│ 💾 Kingston USB (OS): /home/maurodipa/Dischi_cloud_NAS/.env │
│    └─ MASTER_KEY = 9f8a7b6c...                             │
│                                                             │
│ 💾 Disk 1 (CloudData): /mnt/disk1/CloudData/               │
│    └─ File cifrati (AES-256)                               │
│                                                             │
│ 💾 Disk 2 (CloudBackup): /mnt/disk2/CloudBackup/           │
│    └─ Backup file cifrati                                  │
└─────────────────────────────────────────────────────────────┘
```

Se un malintenzionato sottrae l'intero Raspberry Pi completo dei dischi dati e del supporto di sistema, possiede **sia il lucchetto che la chiave**, potendo decifrare tutti i dati in pochi minuti.

---

## 2. Da cosa protegge (e da cosa NO) la SSE in `.env`?

### ✅ Scenario in cui la protezione è EFFICACE:
- **Furto o smarrimento di un singolo disco dati:** Se qualcuno ruba solo il *Disk 1* o il *Disk 2* (o li trova in discarica dopo la dismissione), i dati sono totalmente inaccessibili senza il file `.env` presente sul supporto OS del Raspberry Pi.
- **Accesso non autorizzato di utenti standard:** Utenti della rete locale o del NAS senza permessi di `root` / accesso SSH non possono accedere al file `.env` e non possono leggere i file in chiaro.

### ❌ Scenario in cui la protezione NON è efficace:
- **Furto dell'intera apparecchiatura:** Se l'attaccante ruba fisicamente il Raspberry Pi insieme alla chiavetta OS e ai due hard disk.
- **Compromissione totale con permessi di root (SSH):** Se un attaccante ottiene i permessi di amministrazione del sistema operativo sul Raspberry Pi, può leggere sia il file `.env` sia i file sul disco.

---

## 3. Alternative per la Gestione della Chiave (Evoluzioni Future)

Se in futuro si volesse superare il limite della co-location, è possibile adottare una di queste soluzioni:

1. **Chiavetta USB esterna di boot (Air-Gapped Key):**
   - La chiave master viene memorizzata su una micro-chiavetta USB separata.
   - La chiavetta viene inserita nel Raspberry solo durante il boot e rimossa subito dopo che la chiave è stata caricata in RAM.

2. **Passphrase all'avvio via SSH:**
   - La chiave master non è mai salvata su disco.
   - Ad ogni riavvio del server, l'amministratore deve connettersi via SSH ed inserire una password manuale per sbloccare la chiave in RAM.

3. **Key Management Service esterno (KMS / HashiCorp Vault):**
   - La chiave risiede su un server remoto sicuro o in un vault cloud protetto da autenticazione.
