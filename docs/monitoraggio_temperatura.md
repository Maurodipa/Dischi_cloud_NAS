# Comandi SSH per misurare la temperatura del Raspberry

## 1. Controllare la temperatura attuale
```bash
vcgencmd measure_temp
```

## 2. Monitorare la temperatura in tempo reale
```bash
watch -n 1 vcgencmd measure_temp
```

## 3. Capire se il Pi sta limitando le prestazioni (Thermal Throttling)
```bash
vcgencmd get_throttled
```

### Come leggere il risultato:
- **`throttled=0x0`**: Tutto regolare, nessun surriscaldamento o calo di tensione.
- Se vedi numeri diversi da `0x0` contenenti un **8** o un **2** in posizioni specifiche (es. `0x80008` o `0x20000`), significa che il Pi è in surriscaldamento ora o lo è stato di recente.

### Valori di riferimento
- **Normale/A riposo**: 40°C - 55°C
- **Sotto carico di lavoro**: 55°C - 75°C
- **Pericolo Surriscaldamento**: > 80°C
