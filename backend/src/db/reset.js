// Reset the database to a clean state. Works against whichever backend is
// configured (file or Supabase Postgres).
//
//   npm run db:reset            -> clears transactional data, keeps users + materials
//   npm run db:reset -- --all   -> wipes everything (users + materials re-seed next boot)
//
// To target Supabase, run with DATA_BACKEND=postgres (or set it in .env).
import { db, dbReady } from './store.js';

await dbReady;

const TRANSACTIONAL = ['requests', 'deliveries', 'returns', 'invoices', 'audit', 'otps', 'refreshTokens', 'erpQueue'];
const all = process.argv.includes('--all');
const targets = all ? [...TRANSACTIONAL, 'users', 'materials'] : TRANSACTIONAL;

for (const name of targets) {
  if (db[name]) await db[name].replaceAll([]);
}

console.log(`[reset] cleared: ${targets.join(', ')}`);
process.exit(0);
