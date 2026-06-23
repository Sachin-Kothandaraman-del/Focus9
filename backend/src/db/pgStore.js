// Supabase (Postgres) persistence.
//
// Uses a single jsonb key/value table so the document-style Repository contract
// maps cleanly onto SQL. This keeps the application logic identical to the file
// store while giving real, durable, serverless-friendly persistence on Vercel.
//
//   kv(collection, id, data jsonb, created_at)
//
// Connect via Supabase's connection POOLER (port 6543, "Transaction" mode) for
// serverless — hence prepare:false. SSL is required by Supabase.
import postgres from 'postgres';
import { config } from '../config.js';

let sql;
export function getSql() {
  if (!sql) {
    if (!config.db.url) throw new Error('DATABASE_URL is not set (required for postgres backend).');
    sql = postgres(config.db.url, { ssl: config.db.ssl, prepare: false, max: 3, idle_timeout: 20 });
  }
  return sql;
}

export async function initPg() {
  const s = getSql();
  // `if not exists` still races when several serverless cold-starts run this at
  // once (Postgres can raise duplicate_table / duplicate_object). Those are safe
  // to ignore — the object ends up created exactly once either way.
  const ignoreRace = (err) => {
    if (['42P07', '42P06', '42710', '23505'].includes(err.code)) return;
    throw err;
  };
  await s`
    create table if not exists kv (
      collection text not null,
      id         text not null,
      data       jsonb not null,
      created_at timestamptz not null default now(),
      primary key (collection, id)
    )`.catch(ignoreRace);
  await s`create index if not exists kv_collection_idx on kv (collection)`.catch(ignoreRace);
}

export class PgRepository {
  constructor(name) {
    this.name = name;
  }
  async all() {
    const s = getSql();
    const rows = await s`select data from kv where collection=${this.name} order by created_at asc`;
    return rows.map((r) => r.data);
  }
  async find(predicate) {
    return (await this.all()).find(predicate);
  }
  async filter(predicate) {
    return (await this.all()).filter(predicate);
  }
  async getById(id) {
    if (id === undefined || id === null) return undefined;
    const s = getSql();
    const rows = await s`select data from kv where collection=${this.name} and id=${id} limit 1`;
    return rows[0]?.data;
  }
  async insert(record) {
    const s = getSql();
    await s`insert into kv (collection, id, data) values (${this.name}, ${record.id}, ${s.json(record)})
            on conflict (collection, id) do update set data = excluded.data`;
    return record;
  }
  async update(id, patch) {
    const current = await this.getById(id);
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    const s = getSql();
    await s`update kv set data=${s.json(next)} where collection=${this.name} and id=${id}`;
    return next;
  }
  async replaceAll(rows) {
    const s = getSql();
    await s`delete from kv where collection=${this.name}`;
    for (const r of rows) await this.insert(r);
  }
  async delete(id) {
    if (id === undefined || id === null) return false;
    const s = getSql();
    await s`delete from kv where collection=${this.name} and id=${id}`;
    return true;
  }
  async count() {
    const s = getSql();
    const rows = await s`select count(*)::int as c from kv where collection=${this.name}`;
    return rows[0].c;
  }
}
