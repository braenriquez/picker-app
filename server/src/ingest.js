// Ingest pipeline: raw .xlsx buffers -> parsed/merged inventory -> a new immutable version.
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { makeParser } from './parsers.js';
import { makeClassifier } from './classify.js';
import { getDb, getState, setState, loadOverrides, logIngest } from './db.js';
import { maybeEncryptBlob } from './envelope.js';

const dedupeKey = (i) => `${i.brand}||${i.lot}||${i.model}`;

// Merge parsed results from several files the same way importFile() does: first occurrence wins.
function mergeParsed(results) {
  const items = [], unclassified = [];
  const seenItems = new Set(), seenUnc = new Set();
  for (const r of results) {
    for (const it of r.items) { const k = dedupeKey(it); if (!seenItems.has(k)) { seenItems.add(k); items.push(it); } }
    for (const u of r.unclassified) { const k = dedupeKey(u); if (!seenUnc.has(k)) { seenUnc.add(k); unclassified.push(u); } }
  }
  return { items, unclassified };
}

// Build a version from a set of { filename, buffer } sources. Returns the new version id.
// sources are persisted so the version can be rebuilt later with updated category overrides.
export async function ingestSources(sources, { source = 'manual', sourceMeta = {} } = {}) {
  if (!sources.length) throw new Error('no source files');
  const overrides = loadOverrides();
  const classifyModel = makeClassifier(overrides);
  const { parseWorkbook } = makeParser({ XLSX, classifyModel });

  const results = sources.map((s) => parseWorkbook(s.buffer));
  const merged = mergeParsed(results);

  const versionId = await persistVersion(merged, { source, sourceMeta });
  const db = getDb();
  const insSrc = db.prepare('INSERT INTO version_sources (version_id, filename, data) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    for (const s of sources) insSrc.run(versionId, s.filename, s.buffer);
  });
  tx();

  logIngest({ source, status: 'ok', message: `version ${versionId}`, meta: { ...sourceMeta, item_count: merged.items.length, unclass_count: merged.unclassified.length } });
  return versionId;
}

// Re-parse the source files behind a given version with the CURRENT overrides, producing a
// fresh version. Use after the admin reassigns categories.
export async function rebuildFromSources(versionId, { source = 'manual' } = {}) {
  const db = getDb();
  const rows = db.prepare('SELECT filename, data FROM version_sources WHERE version_id = ?').all(versionId);
  if (!rows.length) throw new Error(`version ${versionId} has no stored sources`);
  const sources = rows.map((r) => ({ filename: r.filename, buffer: r.data }));
  return ingestSources(sources, { source, sourceMeta: { rebuiltFrom: versionId } });
}

// Persist a normalized { items, unclassified } object as a new version and activate it.
async function persistVersion(blobObj, { source, sourceMeta }) {
  const db = getDb();
  const plaintext = gzipSync(Buffer.from(JSON.stringify(blobObj)));
  const etag = createHash('sha256').update(plaintext).digest('hex').slice(0, 32);

  // If this exact content already exists, just re-activate it instead of duplicating.
  const existing = db.prepare('SELECT id FROM versions WHERE etag = ?').get(etag);
  if (existing) { setState('current_version_id', existing.id); return existing.id; }

  const { blob, enc } = await maybeEncryptBlob(plaintext);
  const info = db
    .prepare(
      `INSERT INTO versions (created_at, source, source_meta, item_count, unclass_count, etag, blob, blob_enc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(Date.now(), source, JSON.stringify(sourceMeta || {}), blobObj.items.length, blobObj.unclassified.length, etag, blob, enc ? 1 : 0);
  setState('current_version_id', info.lastInsertRowid);
  return info.lastInsertRowid;
}

// Fetch the currently-active version row (or null).
export function currentVersion() {
  const id = getState('current_version_id');
  if (!id) return null;
  return getDb().prepare('SELECT * FROM versions WHERE id = ?').get(Number(id)) || null;
}

// Distinct unclassified models in the active version, for the admin "needs a category" list.
// Returns [] when the active version is envelope-encrypted (plaintext isn't available server-side).
export function gunzipCurrentUnclassified() {
  const ver = currentVersion();
  if (!ver || ver.blob_enc) return [];
  let obj;
  try {
    obj = JSON.parse(gunzipSync(ver.blob).toString('utf8'));
  } catch {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const u of obj.unclassified || []) {
    if (seen.has(u.model)) continue;
    seen.add(u.model);
    out.push({ model: u.model, brand: u.brand, lot: u.lot });
  }
  return out;
}
