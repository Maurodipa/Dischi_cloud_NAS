-- /etc/lsyncd/lsyncd.conf.lua
-- File di configurazione lsyncd 2.2.3 per Dischi Cloud NAS
-- Sincronizzazione speculare in tempo reale da disk1 (CloudData) a disk2 (CloudBackup)

settings {
    logfile        = "/var/log/lsyncd/lsyncd.log",
    statusFile     = "/var/log/lsyncd/lsyncd.status",
    statusInterval = 30,
    nodaemon       = false
}

-- Layer rsync personalizzato con webhook via collect()
local rsync_with_webhook = {
    checkgauge = default.rsync.checkgauge,
    init       = default.rsync.init,
    action     = default.rsync.action,

    -- collect() viene chiamata da lsyncd ogni volta che un processo rsync figlio termina
    collect = function(agent, exitcode)
        if exitcode == 0 then
            os.execute("/usr/local/bin/sync-webhook.sh completed 0 &")
        elseif exitcode ~= 20 then -- exitcode 20 = shutdown ordinato di lsyncd (non un errore)
            os.execute("/usr/local/bin/sync-webhook.sh error " .. exitcode .. " &")
        end
        return default.rsync.collect(agent, exitcode)
    end
}

sync {
    rsync_with_webhook,
    source  = "/mnt/disk1/CloudData/",
    target  = "/mnt/disk2/CloudBackup/",
    exclude = { ".tus_tmp/", ".dischi-cloud/" },
    rsync = {
        archive    = true,
        compress   = false,
        whole_file = false,
        delete     = true,
        _extra     = { "--size-only" }
    }
}
