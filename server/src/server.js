import 'dotenv/config';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { getDb } from './db.js';
import { warmup } from './auth.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhook.js';

const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  bodyLimit: 25 * 1024 * 1024, // inventory spreadsheets base64'd in webhook bodies can be large
});

await fastify.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 30 } });

// CORS: the PWA (GitHub Pages in prod, the dev server locally) is a different origin than this
// API, so the browser needs these headers to call /api/*. CORS_ORIGIN can be a comma-separated
// allowlist; unset/'*' reflects the request origin (fine — auth is Bearer-token, not cookies).
const corsEnv = (process.env.CORS_ORIGIN || '').trim();
const corsOrigin = !corsEnv || corsEnv === '*' ? true : corsEnv.split(',').map((s) => s.trim());
await fastify.register(cors, {
  origin: corsOrigin,
  methods: ['GET', 'POST'],
  // The PWA reads these off the inventory response; they aren't CORS-safelisted by default.
  exposedHeaders: ['ETag', 'X-Inventory-Version'],
  maxAge: 86400,
});

await fastify.register(apiRoutes);
await fastify.register(adminRoutes);
await fastify.register(webhookRoutes);

getDb();        // ensure schema is applied on boot
await warmup(); // preload libsodium if envelope mode is on

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';

try {
  await fastify.listen({ port, host });
  fastify.log.info(`picker inventory server on http://${host}:${port}`);
  fastify.log.info('expose with:  tailscale funnel --bg --https=443 --set-path=/api http://%s:%d/api', host, port);
  fastify.log.info('admin via:    tailscale serve  --bg --https=8443 http://%s:%d', host, port);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
