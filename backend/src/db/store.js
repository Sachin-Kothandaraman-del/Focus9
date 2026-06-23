// Data-layer selector. Exposes a `db` of async repositories plus a `dbReady`
// promise that resolves once the chosen backend is initialised + seeded.
//
//   DATA_BACKEND=file      -> local JSON files (default for local dev)
//   DATA_BACKEND=postgres  -> Supabase Postgres (default when DATABASE_URL set)
import { config } from '../config.js';
import { FileRepository, initFile } from './fileStore.js';

const COLLECTIONS = [
  'users', 'otps', 'refreshTokens', 'materials', 'requests',
  'deliveries', 'returns', 'invoices', 'audit', 'erpQueue',
];

const usePostgres = config.db.backend === 'postgres';

let Repo, init;
if (usePostgres) {
  // Lazy import so the `postgres` package isn't required for file-mode dev.
  const pg = await import('./pgStore.js');
  Repo = pg.PgRepository;
  init = pg.initPg;
} else {
  Repo = FileRepository;
  init = initFile;
}

export const db = Object.fromEntries(COLLECTIONS.map((name) => [name, new Repo(name)]));

// Resolves after table creation + first-run seeding. Awaited by a middleware
// before any request handler touches the database.
export const dbReady = (async () => {
  await init();
  const { ensureSeed } = await import('./seed.js');
  await ensureSeed();
})();
