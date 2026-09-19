#!/bin/bash
# /usr/local/bin/sync-webhook.sh
#
# Script eseguito automaticamente da lsyncd via collect() quando rsync termina.
# Parametri:
#   $1 = status ("completed" oppure "error")
#   $2 = exitcode (0 per successo, codice numerico per errore)

STATUS="${1:-completed}"
EXITCODE="${2:-0}"

PAYLOAD="{\"status\":\"${STATUS}\",\"exitcode\":${EXITCODE}}"

curl -k -s -X POST https://localhost:3443/api/sync/webhook \
     -H "Content-Type: application/json" \
     -d "${PAYLOAD}" \
     --max-time 5 \
     || echo "[sync-webhook.sh] Impossibile contattare l'app Dischi Cloud su localhost" >&2
