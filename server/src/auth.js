// Connection keys + short-lived API tokens.
//
// A connection key shown to the user is "<key_id>.<secret>":
//   key_id  – public, indexed, lets us find the row without scanning (8 base32 chars)
//   secret  – 32 random bytes (base32), verified against a scrypt hash, never stored in clear
// The PWA stores the whole string and sends it to POST /api/auth to exchange for a JWT.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getDb } from './db.js';
import { wrapContentKey, sodiumReady } from './envelope.js';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes) {
  let out = '';
  for (const b of bytes) out += B32[b & 31];
  return out;
}

function hashSecret(secret) {
  const salt = randomBytes(16);
  const dk = scryptSync(secret, salt, 32);
  return `${salt.toString('hex')}:${dk.toString('hex')}`;
}
function verifySecret(secret, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const dk = scryptSync(secret, Buffer.from(saltHex, 'hex'), 32);
  const expected = Buffer.from(hashHex, 'hex');
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

// Create a new connection key. Returns the plaintext key string ONCE — it cannot be recovered.
export async function createKey(label) {
  const db = getDb();
  const keyId = base32(randomBytes(8)).toLowerCase();
  const secretBytes = randomBytes(20); // 160 bits -> 32 base32 chars
  const secret = base32(secretBytes);
  const wrapped = await wrapContentKey(Buffer.from(secret)); // null unless ENABLE_ENVELOPE=1
  db.prepare(
    `INSERT INTO keys (key_id, label, secret_hash, wrapped_kc, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(keyId, label, hashSecret(secret), wrapped, Date.now());
  return { keyId, key: `${keyId}.${secret}`, label };
}

export function listKeys() {
  return getDb()
    .prepare('SELECT id, key_id, label, created_at, last_used_at, revoked_at FROM keys ORDER BY created_at DESC')
    .all();
}

export function revokeKey(id) {
  getDb().prepare('UPDATE keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(Date.now(), id);
}

// Validate a connection key string. Returns the key row on success, null otherwise.
export function authenticateKey(keyString) {
  if (typeof keyString !== 'string' || !keyString.includes('.')) return null;
  const dot = keyString.indexOf('.');
  const keyId = keyString.slice(0, dot);
  const secret = keyString.slice(dot + 1);
  const row = getDb().prepare('SELECT * FROM keys WHERE key_id = ?').get(keyId);
  if (!row || row.revoked_at) return null;
  if (!verifySecret(secret, row.secret_hash)) return null;
  getDb().prepare('UPDATE keys SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id);
  return row;
}

// --- JWT ---
function jwtKey() {
  return new TextEncoder().encode(process.env.JWT_SECRET || 'dev-insecure-secret');
}
export async function issueToken(keyRow) {
  const ttl = Number(process.env.JWT_TTL || 3600);
  const token = await new SignJWT({ kid: keyRow.key_id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(keyRow.id))
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(jwtKey());
  return { token, expires_at: Math.floor(Date.now() / 1000) + ttl };
}
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, jwtKey());
    // Reject tokens whose key was revoked after issuance.
    const row = getDb().prepare('SELECT revoked_at FROM keys WHERE id = ?').get(Number(payload.sub));
    if (!row || row.revoked_at) return null;
    return payload;
  } catch {
    return null;
  }
}

// Eagerly load libsodium when envelope is enabled so the first key/auth call isn't slow.
export async function warmup() {
  if (process.env.ENABLE_ENVELOPE === '1') await sodiumReady();
}
