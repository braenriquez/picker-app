-- Picker inventory backend schema (SQLite).
-- Applied idempotently on boot by src/db.js.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- One row per generated connection key.
-- The key shown to the user is "<key_id>.<secret>"; only key_id is stored in clear (for fast
-- lookup), the secret is verified against secret_hash (scrypt). wrapped_kc is only used when
-- ENABLE_ENVELOPE=1 (layer 3): it is the shared content key encrypted to this key's device.
CREATE TABLE IF NOT EXISTS keys (
  id            INTEGER PRIMARY KEY,
  key_id        TEXT NOT NULL UNIQUE,   -- public lookup id (base32, 8 chars)
  label         TEXT NOT NULL,          -- "Jose's iPad"
  secret_hash   TEXT NOT NULL,          -- scrypt(secret) as "salt:hash" hex
  wrapped_kc    TEXT,                   -- base64; only if ENABLE_ENVELOPE=1
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER,
  revoked_at    INTEGER
);

-- Each successful ingest = one immutable version. Admin can roll back by re-activating an old one.
CREATE TABLE IF NOT EXISTS versions (
  id            INTEGER PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  source        TEXT NOT NULL,          -- 'email' | 'manual' | 'cli'
  source_meta   TEXT,                   -- JSON: { sender, subject, filename }
  item_count    INTEGER NOT NULL,
  unclass_count INTEGER NOT NULL,
  etag          TEXT NOT NULL UNIQUE,   -- sha256 of the normalized (plaintext) blob
  blob          BLOB NOT NULL,          -- gzipped JSON { items, unclassified } (or ciphertext if layer 3)
  blob_enc      INTEGER NOT NULL DEFAULT 0  -- 1 if blob is envelope ciphertext
);

-- Raw source spreadsheets behind each version, so the admin can reassign categories and
-- rebuild a fresh version WITHOUT re-forwarding the email.
CREATE TABLE IF NOT EXISTS version_sources (
  id         INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  data       BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_version_sources_vid ON version_sources(version_id);

-- Simple key/value for pointers like current_version_id and the shared content key.
CREATE TABLE IF NOT EXISTS state (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

-- Admin category assignments, keyed by garment model string. This is the server-side equivalent
-- of the PWA's `memory` map: classifyModel() consults it before falling back to DEFAULT_RULES.
-- Reassigning a model here and rebuilding moves it out of the "unclassified" bucket.
CREATE TABLE IF NOT EXISTS category_overrides (
  model      TEXT PRIMARY KEY,
  category   TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Append-only audit trail of every ingest attempt.
CREATE TABLE IF NOT EXISTS ingest_log (
  id      INTEGER PRIMARY KEY,
  ts      INTEGER NOT NULL,
  source  TEXT,
  status  TEXT,                          -- 'ok' | 'error'
  message TEXT,
  meta    TEXT                           -- JSON
);
