// Builds and exports the Express app (no .listen here) so the SAME app can be
// run as a long-lived server locally (server.js) and as a Vercel serverless
// function (../api/index.js).
import 'express-async-errors'; // lets async route handlers throw to errorHandler
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { dbReady } from './db/store.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import materialRoutes from './routes/materials.routes.js';
import requestRoutes from './routes/requests.routes.js';
import adminRoutes from './routes/admin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend', 'public');

const app = express();
app.disable('x-powered-by');

// --- Security headers (Security doc: harden HTTP, HSTS, CSP) -----------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: config.https.enabled || process.env.VERCEL ? { maxAge: 15552000, includeSubDomains: true } : false,
  })
);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || config.cors.origins.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '256kb' }));

// Ensure the database is initialised + seeded before any handler runs.
app.use(async (req, res, next) => {
  try {
    await dbReady;
    next();
  } catch (e) {
    next(e);
  }
});

// --- Health -----------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    env: config.env,
    dataBackend: config.db.backend,
    focus9Mode: config.focus9.mode,
    time: new Date().toISOString(),
  });
});

// --- API routes (rate-limited) ----------------------------------------------
app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);

// --- Static mobile PWA -------------------------------------------------------
// On Vercel the static files are served by the platform/CDN (see vercel.json);
// locally Express serves them so the whole app runs from one process.
if (!process.env.VERCEL) {
  app.use(express.static(FRONTEND_DIR));
  app.get(/^\/(?!api).*/, (req, res, next) => {
    const indexFile = path.join(FRONTEND_DIR, 'index.html');
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    next();
  });
}

app.use('/api', notFound);
app.use(errorHandler);

export default app;
