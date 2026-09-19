-- /etc/lsyncd/lsyncd.conf.lua
-- Configurazione lsyncd 2.2.3 per Dischi Cloud NAS
-- Usa default.rsync con un wrapper binario personalizzato per i webhook.
-- Nessun layer Lua complesso: massima compatibilità e semplicità.

settings {
    logfile        = "/var/log/lsyncd/lsyncd.log",
    statusFile     = "/var/log/lsyncd/lsyncd.status",
    statusInterval = 30,
    nodaemon       = false
}

sync {
    default.rsync,
    source  = "/mnt/disk1/CloudData/",
    target  = "/mnt/disk2/CloudBackup/",
    exclude = { ".tus_tmp/", ".dischi-cloud/" },
    rsync = {
        -- Punta al nostro wrapper invece del rsync nativo.
        -- Il wrapper esegue il vero rsync e poi invia il webhook.
        binary     = "/usr/local/bin/rsync-wrapper.sh",
        archive    = true,
        compress   = false,
        whole_file = false,
        delete     = true,
        _extra     = { "--size-only" }
    }
}
