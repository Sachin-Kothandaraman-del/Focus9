// Local development server: boots the shared Express app on a real port.
// (On Vercel the app is invoked as a serverless function instead — see api/.)
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { dbReady } from './db/store.js';
import app from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function start() {
  await dbReady; // initialise + seed before accepting traffic

  const certDir = path.join(__dirname, '..', 'certs');
  if (config.https.enabled && fs.existsSync(path.join(certDir, 'server.key'))) {
    const opts = {
      key: fs.readFileSync(path.join(certDir, 'server.key')),
      cert: fs.readFileSync(path.join(certDir, 'server.crt')),
    };
    https.createServer(opts, app).listen(config.port, () => banner('https'));
  } else {
    http.createServer(app).listen(config.port, () => banner('http'));
  }
}

function banner(scheme) {
  console.log('────────────────────────────────────────────────────────────');
  console.log('  E&E × Focus 9 — End-to-End Distribution App');
  console.log(`  Middleware + Mobile PWA running at ${scheme}://localhost:${config.port}`);
  console.log(`  Data backend: ${config.db.backend}   |   Focus 9 mode: ${config.focus9.mode}   |   env: ${config.env}`);
  console.log('  Open the URL above on a phone-sized browser window.');
  console.log('────────────────────────────────────────────────────────────');
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
