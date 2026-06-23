// Data-layer selector. Exposes a `db` of async repositories plus a `dbReady`
// promise that resolves once the chosen backend is initialised + seeded.
//
//   DATA_BACKEND=file      -> local JSON files (default for local dev)
//   DATA_BACKEND=postgres  -> Supabase Postgres (default when DATABASE_URL set)
import { config } from '../config.js';

const COLLECTIONS = [
  'users', 'otps', 'refreshTokens', 'materials', 'requests',
  'deliveries', 'returns', 'invoices', 'audit', 'erpQueue',
];

const usePostgres = config.db.backend === 'postgres';

// Import ONLY the backend in use. fileStore must never be loaded on Vercel
// (its filesystem is read-only) when running in postgres mode.
let Repo, init;
if (usePostgres) {
  const pg = await import('./pgStore.js');
  Repo = pg.PgRepository;
  init = pg.initPg;
} else {
  const file = await import('./fileStore.js');
  Repo = file.FileRepository;
  init = file.initFile;
}

export const db = Object.fromEntries(COLLECTIONS.map((name) => [name, new Repo(name)]));

// Resolves after table creation + first-run seeding. Awaited by a middleware
// before any request handler touches the database.
export const dbReady = (async () => {
  await init();
  const { ensureSeed } = await import('./seed.js');
  await ensureSeed();
})();
