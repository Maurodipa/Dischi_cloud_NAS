const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const os = require('os');

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '127.0.0.1';
}

function getHttpsCredentials() {
    const rootDir = process.cwd();
    const tsKeyPath = path.join(rootDir, 'tailscale.key');
    const tsCertPath = path.join(rootDir, 'tailscale.crt');

    if (fs.existsSync(tsKeyPath) && fs.existsSync(tsCertPath)) {
        return {
            key: fs.readFileSync(tsKeyPath, 'utf8'),
            cert: fs.readFileSync(tsCertPath, 'utf8')
        };
    }

    const certsDir = path.join(rootDir, 'certs');
    if (!fs.existsSync(certsDir)) {
        fs.mkdirSync(certsDir, { recursive: true });
    }

    const keyPath = path.join(certsDir, 'server.key');
    const certPath = path.join(certsDir, 'server.cert');

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        return {
            key: fs.readFileSync(keyPath, 'utf8'),
            cert: fs.readFileSync(certPath, 'utf8')
        };
    }

    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const localIp = getLocalIp();
    const pems = selfsigned.generate(attrs, {
        days: 365,
        keySize: 2048,
        extensions: [{
            name: 'subjectAltName',
            altNames: [
                { type: 2, value: 'localhost' },
                { type: 7, ip: '127.0.0.1' },
                { type: 7, ip: localIp }
            ]
        }]
    });

    fs.writeFileSync(keyPath, pems.private, 'utf8');
    fs.writeFileSync(certPath, pems.cert, 'utf8');

    return {
        key: pems.private,
        cert: pems.cert
    };
}

module.exports = {
    getHttpsCredentials
};
