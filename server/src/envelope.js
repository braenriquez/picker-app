// Layer 3 (optional): app-level envelope encryption. Off unless ENABLE_ENVELOPE=1.
//
// Model: one shared content key Kc encrypts the inventory blob. Kc is wrapped per connection
// key using a key derived from that key's secret, so each device can recover Kc but the server
// never has to hand out plaintext inventory. With this on, even a full DB/transport compromise
// yields ciphertext only — the secrets needed to derive the unwrap keys live on user devices.
import { createRequire } from 'node:module';
import { getState, setState } from './db.js';

// Loaded lazily and via CommonJS: libsodium-wrappers' ESM entry is broken upstream, and we
// don't want to pay (or fail) loading it at all unless ENABLE_ENVELOPE=1.
const require = createRequire(import.meta.url);
let sodium = null;
async function ready() {
  if (sodium) return sodium;
  const _sodium = require('libsodium-wrappers');
  await _sodium.ready;
  sodium = _sodium;
  return sodium;
}

export function envelopeEnabled() {
  return process.env.ENABLE_ENVELOPE === '1';
}

// The shared content key Kc (32 bytes), generated once and stored base64 in state.
async function getContentKey() {
  const s = await ready();
  let b64 = getState('content_key');
  if (!b64) {
    const kc = s.randombytes_buf(s.crypto_secretbox_KEYBYTES);
    b64 = s.to_base64(kc, s.base64_variants.ORIGINAL);
    setState('content_key', b64);
  }
  return s.from_base64(b64, s.base64_variants.ORIGINAL);
}

// Derive the per-key wrap key from a connection-key secret (deterministic, no stored salt needed).
async function wrapKeyFromSecret(secretBytes) {
  const s = await ready();
  // 32-byte keyed hash of the secret -> wrap key. (HKDF-lite; fine for a high-entropy 256-bit secret.)
  return s.crypto_generichash(s.crypto_secretbox_KEYBYTES, secretBytes);
}

// Encrypt the gzipped plaintext blob with Kc. Returns { blob: Buffer(nonce||ct), enc: true }.
// When envelope is disabled, returns the plaintext untouched.
export async function maybeEncryptBlob(plaintext) {
  if (!envelopeEnabled()) return { blob: plaintext, enc: false };
  const s = await ready();
  const kc = await getContentKey();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(plaintext, nonce, kc);
  return { blob: Buffer.concat([Buffer.from(nonce), Buffer.from(ct)]), enc: true };
}

// Wrap Kc for a given connection-key secret. Returns base64 of (nonce||ct), or null when disabled.
export async function wrapContentKey(secretBytes) {
  if (!envelopeEnabled()) return null;
  const s = await ready();
  const kc = await getContentKey();
  const wk = await wrapKeyFromSecret(secretBytes);
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(kc, nonce, wk);
  return s.to_base64(Buffer.concat([Buffer.from(nonce), Buffer.from(ct)]), s.base64_variants.ORIGINAL);
}

// Re-wrap the existing Kc for every key that doesn't have wrapped_kc yet (used when enabling
// envelope after keys already exist — needs the secrets, so it's only callable at key creation).
export { ready as sodiumReady };
