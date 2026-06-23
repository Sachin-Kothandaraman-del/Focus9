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
import { db, dbReady } from './db/store.js';
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
      // Same-origin (no Origin header), explicitly configured origins, and any
      // Vercel deployment (production + preview URLs) are allowed.
      if (!origin) return cb(null, true);
      try {
        const host = new URL(origin).hostname;
        if (config.cors.origins.includes(origin) || /(^|\.)vercel\.app$/.test(host)) {
          return cb(null, true);
        }
      } catch {
        /* malformed origin -> fall through to deny */
      }
      // Deny without throwing: the browser blocks it, but we never 500.
      cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '256kb' }));

// --- Health (NOT gated by the DB, so it can diagnose DB problems) ------------
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  let dbError = null;
  try {
    await dbReady; // initialise + seed
    await db.users.count(); // ping
    dbOk = true;
  } catch (e) {
    dbError = e.message;
  }
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    env: config.env,
    onVercel: !!process.env.VERCEL,
    dataBackend: config.db.backend,
    hasDatabaseUrl: !!config.db.url,
    db: { ok: dbOk, error: dbError },
    focus9Mode: config.focus9.mode,
    time: new Date().toISOString(),
  });
});

// Ensure the database is initialised + seeded before any data handler runs.
app.use(async (req, res, next) => {
  try {
    await dbReady;
    next();
  } catch (e) {
    next(e);
  }
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
