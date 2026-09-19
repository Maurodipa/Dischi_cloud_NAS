-- /etc/lsyncd/lsyncd.conf.lua
-- Configurazione lsyncd 2.2.3 per Dischi Cloud NAS
-- Nota: in lsyncd 2.2.x, 'delete' è un parametro del blocco 'sync', non di 'rsync'!

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
    delete  = true,  -- Questo va qui fuori!
    rsync = {
        archive  = true,
        compress = false,
        _extra   = { "--size-only" }
    }
}
