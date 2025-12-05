const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IP = '192.168.1.197'
const port = 37984;

const mkcertPath = path.join(os.homedir(), '.local/share/mkcert');
const caPath = path.join(mkcertPath, 'rootCA.pem');
const pwaCertPath = path.join(mkcertPath, 'pwa');

const app = express();

app.get('/cert', (req, res) => {
    const certFile = fs.readFileSync(caPath);
    res.setHeader('Content-Disposition', 'attachment; filename="rootCA.pem"');
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.send(certFile);
});

app.use(express.static(path.join(__dirname, 'public')));

const options = {
    key: fs.readFileSync(path.join(pwaCertPath, 'key.pem'), 'utf-8'),
    cert: fs.readFileSync(path.join(pwaCertPath, 'cert.pem'), 'utf-8')
};

https.createServer(options, app).listen(port, () => {
    console.log(`HTTPS server running at https://localhost:${port}`);
    console.log(`Access on your phone at https://${IP}:${port}`);
});
