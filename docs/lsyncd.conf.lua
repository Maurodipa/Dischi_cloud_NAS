-- /etc/lsyncd/lsyncd.conf.lua
-- Configurazione lsyncd 2.2.3 per Dischi Cloud NAS
-- Sincronizzazione speculare in tempo reale: disk1 (CloudData) → disk2 (CloudBackup)
-- Node.js legge /var/log/lsyncd/lsyncd.status ogni 30 secondi per lo stato della dashboard.

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
        archive  = true,
        compress = false,
        delete   = true,
        _extra   = { "--size-only" }
    }
}
