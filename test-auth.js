process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
const https = require('https');
const options = {
  hostname: '127.0.0.1',
  port: 1900,
  path: '/',
  method: 'PROPFIND',
  headers: {
    'Authorization': 'Basic ' + Buffer.from('maurodipa:password123').toString('base64')
  }
};

const req = https.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  process.exit(0);
});
req.on('error', (e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
req.end();
