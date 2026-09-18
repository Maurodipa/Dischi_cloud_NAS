#!/bin/bash
# /usr/local/bin/smart-alert.sh
#
# Script eseguito automaticamente da smartd quando rileva un problema S.M.A.R.T.
# Variables passate da smartd:
#   $SMARTD_DEVICE  = es. /dev/sda
#   $SMARTD_MESSAGE = descrizione del problema
#   $SMARTD_FAILTYPE = tipo di errore
#
# Invia un webhook all'applicazione Dischi Cloud in ascolto su localhost.

DEVICE="${SMARTD_DEVICE:-unknown}"
MESSAGE="${SMARTD_MESSAGE:-Errore S.M.A.R.T. rilevato}"
FAILTYPE="${SMARTD_FAILTYPE:-unknown}"

PAYLOAD="{\"disk\":\"${DEVICE}\",\"message\":\"${MESSAGE} [Tipo: ${FAILTYPE}]\"}"

curl -s -X POST http://localhost:3443/api/system/disk-alert \
     -H "Content-Type: application/json" \
     -d "${PAYLOAD}" \
     --max-time 10 \
     || echo "[smart-alert.sh] Impossibile contattare l'app Dischi Cloud. Webhook fallito." >&2
