# E&E × Focus 9 — End-to-End Distribution App

A complete, runnable B2C-style mobile application for **E&E's end-to-end material
distribution**, integrated (via middleware) with the **Focus 9 (Focus Softnet)
cloud ERP**. This implements all four planning documents that drove it:

| Source document | Where it is implemented |
|---|---|
| **Mobile App System Requirement** (3-layer architecture, offline-first, order → Sales Order) | `frontend/` (presentation) · `backend/` (middleware) · `backend/src/erp/focus9Connector.js` (ERP layer) |
| **Mobile App Security** (JWT, MFA/OTP, TLS, no hardcoded secrets, RBAC, audit, rate limiting) | `backend/src/security/*`, `backend/src/middleware/*`, `.env` |
| **Licenses** (consumers use one API integration user, not per-user ERP seats) | `FOCUS9_INTEGRATION_USER` in `.env`, used by the connector for every ERP call |
| **E&E End-to-End Distribution Flow Chart** | `backend/src/domain/workflow.js` + `distributionService.js` (the state machine) |

---

## 1. Architecture (the 3 layers from the System Requirement doc)

```
┌─────────────────────────────┐
│  MOBILE APP (presentation)  │  frontend/public  — installable PWA, offline-first,
│  mobile-first PWA           │  talks ONLY to the middleware (never to Focus 9)
└──────────────┬──────────────┘
               │  HTTPS + JWT Bearer
┌──────────────▼──────────────┐
│  MIDDLEWARE (business logic)│  backend/  — Node.js + Express
│  auth/MFA, validation,      │  validates & transforms data, enforces the E&E
│  workflow, queue + retry    │  workflow, buffers/retries ERP calls
└──────────────┬──────────────┘
               │  REST + API key (integration user)
┌──────────────▼──────────────┐
│  ERP — Focus 9   +  PROSAFE │  backend/src/erp/  — connectors (mock | live)
│  system of record           │  Sales Order / Delivery Note / Invoice / Returns
└─────────────────────────────┘
```

> **Why a PWA and not Flutter/React Native?** The recommended frameworks are
> interchangeable *presentation* layers over the same middleware API. The PWA was
> chosen so the entire system runs and is verifiable with a single `npm start`,
> is installable on a phone, and works offline (the doc's "offline-first"
> requirement). The REST contract is identical, so a Flutter/React Native client
> can be dropped in later with no backend changes.

---

## 2. The E&E distribution workflow (from the flow chart)

```
Material Request → Receipt Acknowledgement → [Within Allocated Qty?]
        ├─ within allocation ──────────────► auto-approved
        └─ exceeds allocation ─► E&E Approval ─┬─ Yes ─► approved
                                               └─ No  ─► rejected
→ SO Creation (Focus 9) → Delivery Note ("delivery to the person", PROSAFE-validated)
→ Delivery Note Consolidation → Invoice to E&E (Focus 9)
                          (Material Return is a side branch after delivery)
```

Status machine: `DRAFT → SUBMITTED → ACKNOWLEDGED → (PENDING_APPROVAL) →
APPROVED → SO_CREATED → DELIVERED → CONSOLIDATED → INVOICED` (plus `REJECTED`,
`CANCELLED`). Each request carries an immutable **timeline** of every step.

---

## 3. Run it

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:4000** (use a phone-sized browser window, or your
browser's device toolbar). The middleware also serves the mobile PWA, so that is
the only command you need.

Smoke-test the whole flow end-to-end (server must be running):

```bash
npm run test:flow      # 20 checks across auth, both allocation paths, ERP, RBAC
```

### Demo accounts (password `Passw0rd!23`)

| Email | Role | Can do |
|---|---|---|
| `requester@eande.ae` | Requester | Raise/submit requests, view own, initiate returns |
| `stores@eande.ae` | Stores | Acknowledge, deliver (PROSAFE), consolidate, invoice |
| `approver@eande.ae` | E&E Approver | Approve/reject over-allocation requests |
| `admin@eande.ae` | Administrator | Everything + ERP queue + audit trail |

Login is **two-step (MFA)**: password → 6-digit OTP. In dev the OTP is shown on
the OTP screen (it would be SMS/email in production — set `OTP_DELIVERY`).

> **Try the two paths:** as Requester, order 1 Helmet (within the allocation of
> 2) → after Stores acknowledges it is **auto-approved**. Order 5 Helmets
> (exceeds allocation) → it routes to the **E&E Approver**.

---

## 4. Security — how each item in the Security doc is met

| Security doc recommendation | Implementation |
|---|---|
| Token-based auth (JWT) | `security/tokens.js` — short-lived access + refresh tokens |
| Multi-factor auth (OTP) | `security/otp.js` — hashed, expiring, single-use 6-digit OTP |
| Strong password policy | `security/password.js` — length + complexity rules |
| Never store secrets in plain text | bcrypt (cost 12) for passwords; OTPs SHA-256 hashed |
| No hardcoded secrets | all secrets in `backend/.env` (git-ignored); `.env.example` provided |
| Least-privilege / RBAC | `middleware/auth.js` `authorize(...roles)` on every sensitive route |
| Rate limiting (anti-brute-force) | `middleware/rateLimit.js` — tight on `/auth`, looser on API |
| Enforce HTTPS / TLS, HSTS | `ENABLE_HTTPS=1` + `backend/certs/`; HSTS via Helmet when enabled |
| Harden HTTP / CSP headers | `helmet()` with a strict Content-Security-Policy |
| Input validation & transformation | `express-validator` + `middleware/validate.js` on all writes |
| Audit trail / activity logs | `middleware/audit.js` — every state change recorded (admin view) |
| Secure ERP API integration | connector auth via integration-user API key over TLS, env-only |

Network notes for production: the app uses **same-origin** API calls + Bearer
tokens, CSP locks scripts to `'self'`, and CORS is allow-list driven. For a
native Flutter/RN build you would additionally add **certificate pinning** and
platform **Keystore/Keychain** token storage (called out in the Security doc).

---

## 5. Focus 9 / PROSAFE integration (and Licenses)

`backend/src/erp/focus9Connector.js` exposes an ERP-agnostic interface
(`createSalesOrder`, `postDeliveryNote`, `postInvoice`, `postMaterialReturn`).

- `FOCUS9_MODE=mock` (default) runs a built-in simulator so the system works
  with no external ERP.
- `FOCUS9_MODE=live` issues real HTTPS calls to `FOCUS9_BASE_URL` using
  `FOCUS9_INTEGRATION_USER` + `FOCUS9_API_KEY`. Per the **Licenses doc**, app
  consumers are *not* ERP seats — every ERP call goes through this single
  integration user. The request/response mapping is centralised in this one file,
  so wiring the real Focus 9 endpoints (once Focus Softnet provides the API spec)
  only touches the connector.

All ERP calls go through `erp/queue.js`, which records a durable queue entry and
**retries with exponential backoff** — the System Requirement doc's "queue orders
and retry failed requests, preventing data loss if the ERP is temporarily slow."

`PROSAFE` (`erp/prosafeConnector.js`) validates that the person receiving
material is a valid/active E&E employee before a Delivery Note is issued.

---

## 6. Project layout

```
Focus9_App/
├─ vercel.json                  serverless API + static PWA + SPA routing
├─ supabase/schema.sql          Postgres schema (optional; app self-provisions)
├─ backend/
│  ├─ api/index.js              Vercel serverless entry (exports the Express app)
│  ├─ src/
│  │  ├─ app.js                 Express app (shared by local server + Vercel)
│  │  ├─ server.js              local dev server (listens on a port)
│  │  ├─ config.js              env-driven config (no hardcoded secrets)
│  │  ├─ security/              password.js · tokens.js · otp.js
│  │  ├─ middleware/            auth(RBAC) · validate · rateLimit · audit · errors
│  │  ├─ erp/                   focus9Connector · prosafeConnector · queue(retry)
│  │  ├─ domain/                workflow(state machine) · distributionService
│  │  ├─ routes/                auth · materials · requests · admin
│  │  ├─ db/                    store(selector) · fileStore · pgStore(Supabase) · seed
│  │  └─ test/e2e-flow.js       end-to-end workflow test
│  ├─ .env.example
│  └─ package.json
└─ frontend/public/             mobile PWA (index.html, css, js/views, service-worker)
```

## 7. Demo data & reset

The app seeds demo users + a PPE/safety material catalogue on first boot. To wipe
all transactional data and start clean, delete the JSON files:

```bash
rm backend/src/data/*.json      # users & materials re-seed on next start
```

## 8. Deploy to Vercel + Supabase

The app is built to run both ways with **no code changes** — local uses the JSON
file store; the cloud uses Supabase Postgres. The data backend auto-switches to
`postgres` whenever `DATABASE_URL` is present.

### A. Create the Supabase database
1. Create a project at [supabase.com](https://supabase.com).
2. Project Settings → Database → **Connection string → URI**, and copy the
   **Connection pooler** URI (host `...pooler.supabase.com`, port **6543**).
   The pooler is required for serverless. Put your DB password into the URI.
3. (Optional) In the SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
   You can skip this — the app creates its table and seeds demo data on first run.

### B. Push to GitHub
```bash
git init
git add -A                      # commits the whole project (.gitignore excludes secrets)
git commit -m "E&E x Focus 9 distribution app"
git branch -M main
git remote add origin https://github.com/<you>/Focus9.git
git push -u origin main
```

### C. Deploy on Vercel
1. [vercel.com](https://vercel.com) → **Add New → Project** → import the GitHub repo.
   Vercel reads [`vercel.json`](vercel.json) (serverless API + static PWA + SPA routing) automatically.
2. Add **Environment Variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | your Supabase **pooler** URI (port 6543) |
   | `JWT_ACCESS_SECRET` | a long random string |
   | `JWT_REFRESH_SECRET` | a different long random string |
   | `OTP_DELIVERY` | `dev` (shows OTP in-app) — wire an SMS/email gateway for prod |
   | `FOCUS9_MODE` | `mock` (until Focus Softnet provide the live API) |

   Generate secrets: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
3. **Deploy.** Open the Vercel URL → the mobile PWA loads, the API runs as a
   serverless function, and data persists in Supabase. (`DATA_BACKEND` is
   inferred as `postgres` from `DATABASE_URL`; Supabase's SSL is on by default.)

> `VERCEL` is set automatically in the cloud, so the platform/CDN serves the
> static PWA and Express only handles `/api/*`.

### Verify a cloud deploy
```bash
BASE_URL=https://<your-app>.vercel.app npm run test:flow   # runs the 20 checks against prod
```

## 9. Production hardening checklist (next steps)

- Replace the JSON store with a managed DB (the `Repository` interface is the seam).
- Obtain the real Focus 9 REST spec + sandbox from Focus Softnet; set `FOCUS9_MODE=live`.
- Front the API with HTTPS/TLS 1.2+ (terminate at a load balancer or set `ENABLE_HTTPS=1`).
- Deliver OTP via a real SMS/email gateway (`OTP_DELIVERY`).
- For a native client: add certificate pinning, RASP/app-attestation, code
  obfuscation, and SAST/DAST in CI (all named in the Security doc).
```
