#!/bin/bash
# /usr/local/bin/rsync-wrapper.sh
#
# Wrapper di rsync chiamato da lsyncd invece del binario rsync nativo.
# Esegue il vero rsync con tutti gli argomenti passati da lsyncd,
# poi invia un webhook all'app Dischi Cloud con l'esito dell'operazione.

# Esegui il vero rsync passando tutti gli argomenti invariati
/usr/bin/rsync "$@"
EXITCODE=$?

# Invia il webhook solo se non è uno shutdown ordinato di lsyncd (exitcode 20)
if [ "$EXITCODE" -eq 0 ]; then
    /usr/local/bin/sync-webhook.sh completed 0
elif [ "$EXITCODE" -ne 20 ]; then
    /usr/local/bin/sync-webhook.sh error "$EXITCODE"
fi

exit $EXITCODE
