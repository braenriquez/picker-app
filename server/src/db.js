import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

export function getDb() {
  if (db) return db;
  const dbPath = resolve(process.env.DB_PATH || './data/inventory.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(resolve(__dirname, '../schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

// --- state helpers ---
export function getState(k, fallback = null) {
  const row = getDb().prepare('SELECT v FROM state WHERE k = ?').get(k);
  return row ? row.v : fallback;
}
export function setState(k, v) {
  getDb()
    .prepare('INSERT INTO state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .run(k, String(v));
}

// --- category overrides (server-side equivalent of the PWA `memory` map) ---
export function loadOverrides() {
  const rows = getDb().prepare('SELECT model, category FROM category_overrides').all();
  const map = {};
  for (const r of rows) map[r.model] = r.category;
  return map;
}
export function setOverride(model, category) {
  getDb()
    .prepare(
      `INSERT INTO category_overrides (model, category, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(model) DO UPDATE SET category = excluded.category, updated_at = excluded.updated_at`
    )
    .run(model, category, Date.now());
}

export function logIngest({ source, status, message, meta }) {
  getDb()
    .prepare('INSERT INTO ingest_log (ts, source, status, message, meta) VALUES (?, ?, ?, ?, ?)')
    .run(Date.now(), source || null, status || null, message || null, meta ? JSON.stringify(meta) : null);
}
