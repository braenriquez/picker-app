// Email-ingest webhook. Fed by a Cloudflare Email Routing Worker (or any forwarder) that
// HMAC-signs the body with WEBHOOK_SECRET. This IS internet-facing if you funnel it, so it is
// defended by (1) constant-time HMAC verification and (2) a sender allowlist.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ingestSources } from '../ingest.js';
import { logIngest } from '../db.js';

function validSignature(rawBody, signature) {
  if (!signature) return false;
  const expected = createHmac('sha256', process.env.WEBHOOK_SECRET || '').update(rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function senderAllowed(from) {
  const allow = (process.env.WEBHOOK_FROM_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.length) return true; // no allowlist configured -> rely on HMAC only
  const addr = String(from || '').toLowerCase();
  return allow.some((a) => addr.includes(a));
}

export default async function webhookRoutes(fastify) {
  // Capture the raw body so the HMAC matches exactly what the Worker signed.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body;
    try { done(null, JSON.parse(body)); } catch (e) { done(e); }
  });

  // body: { from, subject, attachments: [{ name, content_base64 }] }
  fastify.post('/webhook/email', async (req, reply) => {
    const sig = req.headers['x-signature'];
    if (!validSignature(req.rawBody || '', sig)) {
      logIngest({ source: 'email', status: 'error', message: 'bad signature' });
      return reply.code(401).send({ error: 'bad signature' });
    }
    const { from, subject, attachments } = req.body || {};
    if (!senderAllowed(from)) {
      logIngest({ source: 'email', status: 'error', message: `sender not allowed: ${from}` });
      return reply.code(401).send({ error: 'sender not allowed' });
    }
    const xlsx = (attachments || []).filter((a) => /\.xl[st]x?$/i.test(a.name || ''));
    if (!xlsx.length) {
      logIngest({ source: 'email', status: 'error', message: 'no spreadsheet attachments', meta: { from, subject } });
      return reply.code(400).send({ error: 'no .xls/.xlsx attachments' });
    }
    const sources = xlsx.map((a) => ({ filename: a.name, buffer: Buffer.from(a.content_base64, 'base64') }));
    try {
      const versionId = await ingestSources(sources, { source: 'email', sourceMeta: { from, subject, filenames: sources.map((s) => s.filename) } });
      return reply.code(202).send({ ok: true, versionId });
    } catch (e) {
      logIngest({ source: 'email', status: 'error', message: e.message, meta: { from, subject } });
      return reply.code(500).send({ error: 'ingest failed' });
    }
  });
}
