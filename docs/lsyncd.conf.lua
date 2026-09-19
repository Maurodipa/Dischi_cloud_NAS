-- /etc/lsyncd/lsyncd.conf.lua
-- Configurazione lsyncd 2.2.3 per Dischi Cloud NAS (Debian arm64)
-- Tutti i parametri rsync passati via _extra per bypassare il checkgauge
-- della build Debian che riconosce solo un sottoinsieme di opzioni.

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
        _extra = {
            "--archive",
            "--size-only",
            "--delete",
            "--no-compress"
        }
    }
}
