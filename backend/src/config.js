// Centralised configuration. All secrets come from environment variables only
// (Security doc: never hardcode secrets). dotenv loads them from backend/.env.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// A Postgres URL whose password contains unencoded URL-structural characters
// (most commonly '@') is ambiguous and breaks the driver. Detect that (the
// authority then has more than one '@') and percent-encode the password so the
// connection works even if the user pasted a raw password into DATABASE_URL.
function normalizePgUrl(url) {
  const m = (url || '').trim().match(/^(postgres(?:ql)?:\/\/)([^/?#]+)(.*)$/i);
  if (!m) return (url || '').trim();
  const [, scheme, authority, rest] = m;
  const at = authority.lastIndexOf('@');
  if (at === -1) return url.trim();
  const userinfo = authority.slice(0, at);
  const host = authority.slice(at + 1);
  const colon = userinfo.indexOf(':');
  if (colon === -1) return url.trim();
  const user = userinfo.slice(0, colon);
  let pass = userinfo.slice(colon + 1);
  if (/[@/:?#[\] ]/.test(pass)) pass = encodeURIComponent(pass); // contains raw special chars
  return `${scheme}${user}:${pass}@${host}${rest}`;
}

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    // Fail fast rather than start an insecure server with a missing secret.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),

  // Data layer: 'file' (local JSON store) or 'postgres' (Supabase).
  // Defaults to postgres automatically when a DATABASE_URL is present
  // (i.e. on Vercel), otherwise the zero-setup file store for local dev.
  db: {
    // On Vercel the filesystem is read-only, so the file store can't work there:
    // whenever a DATABASE_URL is present we force the Postgres backend, even if a
    // stray DATA_BACKEND=file was copied into the environment.
    backend:
      process.env.VERCEL && process.env.DATABASE_URL
        ? 'postgres'
        : process.env.DATA_BACKEND || (process.env.DATABASE_URL ? 'postgres' : 'file'),
    url: normalizePgUrl(process.env.DATABASE_URL || ''),
    // Supabase requires SSL; set DATABASE_SSL=disable for a local test Postgres.
    ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },

  otp: {
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),
    delivery: process.env.OTP_DELIVERY || 'dev', // dev | sms | email
  },

  focus9: {
    mode: process.env.FOCUS9_MODE || 'mock', // mock | live
    baseUrl: process.env.FOCUS9_BASE_URL || '',
    integrationUser: process.env.FOCUS9_INTEGRATION_USER || 'integration-api-user',
    apiKey: process.env.FOCUS9_API_KEY || '',
    companyCode: process.env.FOCUS9_COMPANY_CODE || 'EE01',
  },

  prosafe: {
    mode: process.env.PROSAFE_MODE || 'mock',
    baseUrl: process.env.PROSAFE_BASE_URL || '',
    apiKey: process.env.PROSAFE_API_KEY || '',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:4000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  https: {
    enabled: process.env.ENABLE_HTTPS === '1',
  },

  // Set RATE_LIMIT_DISABLED=1 to turn off auth/API throttling (local dev / demos).
  rateLimit: {
    disabled: process.env.RATE_LIMIT_DISABLED === '1',
  },

  isDev() {
    return this.env !== 'production';
  },
};
