// server/system/smart.service.js
// Gestisce lo stato degli allarmi S.M.A.R.T., l'invio di email e il calendario dei promemoria.

const path = require('path');
const fse = require('fs-extra');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger.js');

// Percorso del file di stato persistente (sopravvive ai riavvii del server)
const ALERT_STATE_FILE = path.join(process.cwd(), 'logs', 'smart-alert.json');

// Stato in memoria (caricato dal file all'avvio)
let alertState = {
    active: false,
    disk: null,
    message: null,
    alertedAt: null,
    reminderSent: false,
    resolvedAt: null,
    resolvedBy: null
};

// ─────────────────────────────────────────────
// Persistenza su file
// ─────────────────────────────────────────────

async function loadAlertState() {
    try {
        if (await fse.pathExists(ALERT_STATE_FILE)) {
            const data = await fse.readJson(ALERT_STATE_FILE);
            alertState = { ...alertState, ...data };
            if (alertState.active) {
                logger.warn(`[S.M.A.R.T.] Stato di allerta precedente rilevato: ${alertState.disk} - ${alertState.message}`);
            }
        }
    } catch (err) {
        logger.error(`[S.M.A.R.T.] Impossibile caricare lo stato dell'allerta: ${err.message}`);
    }
}

async function saveAlertState() {
    try {
        await fse.ensureDir(path.dirname(ALERT_STATE_FILE));
        await fse.writeJson(ALERT_STATE_FILE, alertState, { spaces: 2 });
    } catch (err) {
        logger.error(`[S.M.A.R.T.] Impossibile salvare lo stato dell'allerta: ${err.message}`);
    }
}

// ─────────────────────────────────────────────
// Trasporto Email (nodemailer via Gmail)
// ─────────────────────────────────────────────

function createTransporter() {
    if (!process.env.ALERT_EMAIL_FROM || !process.env.ALERT_EMAIL_PASSWORD) {
        logger.warn('[S.M.A.R.T.] Credenziali email non configurate in .env. Le email di allerta non verranno inviate.');
        return null;
    }
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.ALERT_EMAIL_FROM,
            pass: process.env.ALERT_EMAIL_PASSWORD
        }
    });
}

async function sendEmail(subject, htmlBody) {
    if (!process.env.ALERT_EMAIL_TO) {
        logger.warn('[S.M.A.R.T.] ALERT_EMAIL_TO non configurato. Email non inviata.');
        return;
    }
    const transporter = createTransporter();
    if (!transporter) return;

    try {
        await transporter.sendMail({
            from: `"☁️ Dischi Cloud NAS" <${process.env.ALERT_EMAIL_FROM}>`,
            to: process.env.ALERT_EMAIL_TO,
            subject,
            html: htmlBody
        });
        logger.info(`[S.M.A.R.T.] Email inviata a ${process.env.ALERT_EMAIL_TO}: "${subject}"`);
    } catch (err) {
        logger.error(`[S.M.A.R.T.] Errore nell'invio dell'email: ${err.message}`);
    }
}

// ─────────────────────────────────────────────
// Template Email
// ─────────────────────────────────────────────

function alertEmailHtml(disk, message, alertedAt) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:2px solid #e74c3c;border-radius:8px;overflow:hidden;">
        <div style="background:#e74c3c;padding:20px;color:#fff;">
            <h1 style="margin:0;">🔴 ALLERTA: Errore Disco Rilevato</h1>
            <p style="margin:5px 0 0 0;">Dischi Cloud NAS</p>
        </div>
        <div style="padding:20px;background:#fff;color:#333;">
            <p>Il sistema di monitoraggio <strong>S.M.A.R.T.</strong> ha rilevato un problema hardware su uno dei tuoi dischi.</p>
            <table style="width:100%;border-collapse:collapse;margin:15px 0;">
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;width:30%;">Disco</td><td style="padding:8px;">${disk}</td></tr>
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Messaggio</td><td style="padding:8px;">${message}</td></tr>
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Rilevato il</td><td style="padding:8px;">${new Date(alertedAt).toLocaleString('it-IT')}</td></tr>
            </table>
            <div style="background:#fff3cd;border:1px solid #ffc107;padding:12px;border-radius:4px;margin:15px 0;">
                <strong>⚠️ Azione Richiesta:</strong> Accedi alla dashboard dell'amministratore per visualizzare i dettagli e, dopo aver verificato la situazione, clicca su <em>"✓ Risolto"</em> per archiviare questo allarme.
            </div>
            <p style="color:#888;font-size:0.85em;">Questo messaggio è stato generato automaticamente dal tuo NAS Dischi Cloud.</p>
        </div>
    </div>`;
}

function reminderEmailHtml(disk, message, alertedAt) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:2px solid #f39c12;border-radius:8px;overflow:hidden;">
        <div style="background:#f39c12;padding:20px;color:#fff;">
            <h1 style="margin:0;">🔔 PROMEMORIA: Allerta Disco Non Risolta</h1>
            <p style="margin:5px 0 0 0;">Dischi Cloud NAS</p>
        </div>
        <div style="padding:20px;background:#fff;color:#333;">
            <p>L'allerta S.M.A.R.T. rilevata ieri non è ancora stata marcata come risolta dalla dashboard.</p>
            <table style="width:100%;border-collapse:collapse;margin:15px 0;">
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;width:30%;">Disco</td><td style="padding:8px;">${disk}</td></tr>
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Messaggio</td><td style="padding:8px;">${message}</td></tr>
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Rilevato il</td><td style="padding:8px;">${new Date(alertedAt).toLocaleString('it-IT')}</td></tr>
            </table>
            <p style="color:#888;font-size:0.85em;">Non riceverai ulteriori promemoria. Accedi alla dashboard per risolvere l'allerta.</p>
        </div>
    </div>`;
}

function resolvedEmailHtml(disk, message, alertedAt, resolvedAt, resolvedBy) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:2px solid #27ae60;border-radius:8px;overflow:hidden;">
        <div style="background:#27ae60;padding:20px;color:#fff;">
            <h1 style="margin:0;">✅ Allerta Risolta</h1>
            <p style="margin:5px 0 0 0;">Dischi Cloud NAS</p>
        </div>
        <div style="padding:20px;background:#fff;color:#333;">
            <p>L'allerta S.M.A.R.T. è stata marcata come risolta dall'amministratore.</p>
            <table style="width:100%;border-collapse:collapse;margin:15px 0;">
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;width:30%;">Disco</td><td style="padding:8px;">${disk}</td></tr>
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Problema</td><td style="padding:8px;">${message}</td></tr>
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Rilevato il</td><td style="padding:8px;">${new Date(alertedAt).toLocaleString('it-IT')}</td></tr>
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Risolto il</td><td style="padding:8px;">${new Date(resolvedAt).toLocaleString('it-IT')}</td></tr>
                <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Risolto da</td><td style="padding:8px;">${resolvedBy}</td></tr>
            </table>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────
// API pubblica del servizio
// ─────────────────────────────────────────────

// Accende l'allerta (chiamato dal webhook di smartd)
async function triggerAlert(disk, message) {
    if (alertState.active) {
        logger.warn(`[S.M.A.R.T.] Allerta già attiva. Nuovo evento ignorato: ${disk} - ${message}`);
        return;
    }

    alertState = {
        active: true,
        disk,
        message,
        alertedAt: new Date().toISOString(),
        reminderSent: false,
        resolvedAt: null,
        resolvedBy: null
    };

    await saveAlertState();
    logger.error(`[S.M.A.R.T.] 🔴 ALLERTA ATTIVATA: ${disk} - ${message}`);

    await sendEmail(
        '🔴 ALLERTA: Errore Disco Rilevato sul tuo NAS',
        alertEmailHtml(disk, message, alertState.alertedAt)
    );
}

// Spegne l'allerta (chiamato dall'API /disk-resolve)
async function resolveAlert(username) {
    if (!alertState.active) {
        return { success: false, message: 'Nessuna allerta attiva da risolvere.' };
    }

    const resolvedAt = new Date().toISOString();
    const { disk, message, alertedAt } = alertState;

    alertState = {
        ...alertState,
        active: false,
        resolvedAt,
        resolvedBy: username
    };

    await saveAlertState();
    logger.info(`[S.M.A.R.T.] ✅ Allerta risolta da '${username}': ${disk}`);

    await sendEmail(
        '✅ Allerta Disco Risolta sul tuo NAS',
        resolvedEmailHtml(disk, message, alertedAt, resolvedAt, username)
    );

    return { success: true };
}

// Ritorna lo stato corrente (per la dashboard)
function getAlertState() {
    return { ...alertState };
}

// Controlla se bisogna mandare il promemoria del giorno dopo (schedulato ogni giorno alle 09:00)
async function sendReminderIfNeeded() {
    if (!alertState.active || alertState.reminderSent) return;

    const alertedAt = new Date(alertState.alertedAt);
    const now = new Date();
    const hoursSinceAlert = (now - alertedAt) / (1000 * 60 * 60);

    // Invia il promemoria solo se sono passate almeno 20 ore dall'allerta
    if (hoursSinceAlert >= 20) {
        logger.warn(`[S.M.A.R.T.] Invio promemoria: allerta non risolta da ${Math.round(hoursSinceAlert)} ore.`);
        await sendEmail(
            '🔔 PROMEMORIA: Allerta Disco Non Risolta sul tuo NAS',
            reminderEmailHtml(alertState.disk, alertState.message, alertState.alertedAt)
        );
        alertState.reminderSent = true;
        await saveAlertState();
    }
}

// Schedulatore giornaliero alle 09:00
function scheduleReminderCheck() {
    const now = new Date();
    // Calcola i millisecondi fino alle 09:00 di oggi (o domani se è già passata)
    const next9am = new Date(now);
    next9am.setHours(9, 0, 0, 0);
    if (next9am <= now) next9am.setDate(next9am.getDate() + 1);

    const msUntil9am = next9am - now;
    logger.info(`[S.M.A.R.T.] Prossimo controllo promemoria: ${next9am.toLocaleString('it-IT')}`);

    setTimeout(() => {
        sendReminderIfNeeded();
        // Dopo il primo controllo, eseguilo ogni 24 ore
        setInterval(sendReminderIfNeeded, 24 * 60 * 60 * 1000);
    }, msUntil9am);
}

// Inizializzazione (chiamata da index.js all'avvio)
async function initSmartMonitoring() {
    await loadAlertState();
    scheduleReminderCheck();
    logger.info('[S.M.A.R.T.] Servizio di monitoraggio dischi avviato.');
}

module.exports = {
    initSmartMonitoring,
    triggerAlert,
    resolveAlert,
    getAlertState
};
