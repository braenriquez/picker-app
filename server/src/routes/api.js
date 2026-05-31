// Public API — the only surface exposed through Tailscale Funnel. Bearer-token gated.
import { authenticateKey, issueToken, verifyToken } from '../auth.js';
import { currentVersion } from '../ingest.js';
import { getDb } from '../db.js';

async function requireToken(req, reply) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const payload = m ? await verifyToken(m[1]) : null;
  if (!payload) { reply.code(401).send({ error: 'unauthorized' }); return null; }
  return payload;
}

export default async function apiRoutes(fastify) {
  // Exchange a connection key for a short-lived JWT.
  fastify.post('/api/auth', async (req, reply) => {
    const key = req.body && req.body.key;
    const row = authenticateKey(key);
    if (!row) return reply.code(401).send({ error: 'invalid or revoked key' });
    return issueToken(row);
  });

  // Plaintext inventory (transport-encrypted by Funnel TLS). Served as gzipped JSON.
  fastify.get('/api/inventory', async (req, reply) => {
    const payload = await requireToken(req, reply);
    if (!payload) return;
    const ver = currentVersion();
    if (!ver) return reply.code(404).send({ error: 'no inventory published yet' });
    if (ver.blob_enc) return reply.code(409).send({ error: 'envelope enabled; use /api/inventory.enc' });

    const etag = `"${ver.etag}"`;
    // created_at is when the admin published this version — the inventory's "as of" date.
    if (req.headers['if-none-match'] === etag) {
      return reply
        .header('ETag', etag)
        .header('X-Inventory-Version', String(ver.id))
        .header('X-Inventory-Published', String(ver.created_at))
        .code(304)
        .send();
    }

    reply
      .header('ETag', etag)
      .header('Cache-Control', 'no-cache')
      .header('Content-Type', 'application/json')
      .header('Content-Encoding', 'gzip')
      .header('X-Inventory-Version', String(ver.id))
      .header('X-Inventory-Published', String(ver.created_at));
    return reply.send(ver.blob); // blob is gzipped JSON { items, unclassified }
  });

  // Envelope mode: hand back the ciphertext blob + this key's wrapped content key.
  // The device unwraps Kc with its secret and decrypts the blob locally.
  fastify.get('/api/inventory.enc', async (req, reply) => {
    const payload = await requireToken(req, reply);
    if (!payload) return;
    const ver = currentVersion();
    if (!ver) return reply.code(404).send({ error: 'no inventory published yet' });
    if (!ver.blob_enc) return reply.code(409).send({ error: 'envelope disabled; use /api/inventory' });

    const keyRow = getDb().prepare('SELECT wrapped_kc FROM keys WHERE id = ?').get(Number(payload.sub));
    if (!keyRow || !keyRow.wrapped_kc) return reply.code(409).send({ error: 'no wrapped content key for this connection key' });

    const etag = `"${ver.etag}"`;
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();

    return reply.header('ETag', etag).send({
      version: ver.id,
      etag: ver.etag,
      wrapped_kc: keyRow.wrapped_kc,
      blob_ct: Buffer.from(ver.blob).toString('base64'), // nonce||ciphertext of gzipped JSON
    });
  });

  // Liveness probe (safe to expose).
  fastify.get('/api/health', async () => ({ ok: true }));
}
