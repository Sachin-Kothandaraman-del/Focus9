// Centralised configuration. All secrets come from environment variables only
// (Security doc: never hardcode secrets). dotenv loads them from backend/.env.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
    backend: process.env.DATA_BACKEND || (process.env.DATABASE_URL ? 'postgres' : 'file'),
    url: process.env.DATABASE_URL || '',
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
    companyCode: process.env.FOCUS9_COMPANY_CODE || 'EGA01',
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

  isDev() {
    return this.env !== 'production';
  },
};
