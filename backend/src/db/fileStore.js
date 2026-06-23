// Local JSON-file persistence (zero external dependency) used for development.
// Exposes the SAME async Repository contract as the Postgres store so the rest
// of the app is identical in both modes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

const cache = new Map();

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const file = fileFor(name);
  let rows = [];
  if (fs.existsSync(file)) {
    try {
      rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      rows = [];
    }
  }
  cache.set(name, rows);
  return rows;
}
function persist(name) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = fileFor(name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache.get(name) ?? [], null, 2));
  fs.renameSync(tmp, file);
}

export class FileRepository {
  constructor(name) {
    this.name = name;
    load(name);
  }
  async all() {
    return [...load(this.name)];
  }
  async find(predicate) {
    return load(this.name).find(predicate);
  }
  async filter(predicate) {
    return load(this.name).filter(predicate);
  }
  async getById(id) {
    return load(this.name).find((r) => r.id === id);
  }
  async insert(record) {
    load(this.name).push(record);
    persist(this.name);
    return record;
  }
  async update(id, patch) {
    const rows = load(this.name);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch, updatedAt: new Date().toISOString() };
    persist(this.name);
    return rows[idx];
  }
  async replaceAll(rows) {
    cache.set(this.name, rows);
    persist(this.name);
  }
  async delete(id) {
    const rows = load(this.name);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    rows.splice(idx, 1);
    persist(this.name);
    return true;
  }
  async count() {
    return load(this.name).length;
  }
}

export async function initFile() {
  /* nothing to initialise */
}
