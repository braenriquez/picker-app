// Admin API + dashboard. Reachable ONLY over the tailnet via `tailscale serve` — never funneled.
// Gate: Tailscale Serve injects the ADMIN_HEADER (tailscale-user-login). Public Funnel requests
// never carry it, so requiring it keeps /admin dark to the internet even on the same port.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKey, listKeys, revokeKey } from '../auth.js';
import { ingestSources, rebuildFromSources, currentVersion, gunzipCurrentUnclassified } from '../ingest.js';
import { getDb, setState, setOverride } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADMIN_HTML = resolve(__dirname, '../../public/admin/index.html');

export default async function adminRoutes(fastify) {
  // Tailnet gate for every /admin route.
  fastify.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/admin')) return;
    if (process.env.ADMIN_DEV_BYPASS === '1') return;
    const header = (process.env.ADMIN_HEADER || 'tailscale-user-login').toLowerCase();
    if (!req.headers[header]) {
      reply.code(404).send(); // 404, not 403 — don't reveal the admin surface exists
      return reply;
    }
  });

  fastify.get('/admin', async (req, reply) => {
    reply.type('text/html').send(readFileSync(ADMIN_HTML, 'utf8'));
  });

  // --- status ---
  fastify.get('/admin/api/status', async () => {
    const ver = currentVersion();
    const whoami = process.env.ADMIN_DEV_BYPASS === '1' ? 'dev-bypass' : null;
    return {
      current: ver
        ? { id: ver.id, created_at: ver.created_at, source: ver.source, item_count: ver.item_count, unclass_count: ver.unclass_count, etag: ver.etag, encrypted: !!ver.blob_enc }
        : null,
      envelope: process.env.ENABLE_ENVELOPE === '1',
      whoami,
    };
  });

  // --- connection keys ---
  fastify.get('/admin/api/keys', async () => listKeys());
  fastify.post('/admin/api/keys', async (req, reply) => {
    const label = (req.body && req.body.label || '').trim();
    if (!label) return reply.code(400).send({ error: 'label required' });
    return createKey(label); // returns plaintext key ONCE
  });
  fastify.post('/admin/api/keys/:id/revoke', async (req) => {
    revokeKey(Number(req.params.id));
    return { ok: true };
  });

  // --- category overrides ---
  // List current overrides plus the distinct unclassified models in the active version,
  // so the dashboard can show exactly what still needs a category.
  fastify.get('/admin/api/overrides', async () => {
    const overrides = getDb().prepare('SELECT model, category, updated_at FROM category_overrides ORDER BY model').all();
    const pending = gunzipCurrentUnclassified(); // [{ model, brand, lot }...] distinct by model
    return { overrides, pending };
  });
  fastify.post('/admin/api/overrides', async (req, reply) => {
    const model = (req.body && req.body.model || '').trim();
    const category = (req.body && req.body.category || '').trim();
    if (!model || !category) return reply.code(400).send({ error: 'model and category required' });
    setOverride(model, category);
    return { ok: true };
  });

  // --- inventory upload (manual fallback when the email forward fails) ---
  fastify.post('/admin/api/inventory/upload', async (req, reply) => {
    const sources = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        sources.push({ filename: part.filename, buffer });
      }
    }
    if (!sources.length) return reply.code(400).send({ error: 'no files uploaded' });
    const versionId = await ingestSources(sources, { source: 'manual', sourceMeta: { filenames: sources.map((s) => s.filename) } });
    return { ok: true, versionId };
  });

  // --- versions ---
  fastify.get('/admin/api/versions', async () =>
    getDb().prepare('SELECT id, created_at, source, source_meta, item_count, unclass_count, etag, blob_enc FROM versions ORDER BY id DESC LIMIT 50').all()
  );
  fastify.post('/admin/api/versions/:id/activate', async (req) => {
    setState('current_version_id', Number(req.params.id));
    return { ok: true };
  });
  // Re-parse a version's stored source files with the current category overrides -> new version.
  fastify.post('/admin/api/versions/:id/rebuild', async (req) => {
    const versionId = await rebuildFromSources(Number(req.params.id), { source: 'manual' });
    return { ok: true, versionId };
  });

  fastify.get('/admin/api/ingest-log', async () =>
    getDb().prepare('SELECT * FROM ingest_log ORDER BY id DESC LIMIT 100').all()
  );
}
