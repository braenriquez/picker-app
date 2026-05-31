// Dev server for the picker PWA.
//
//   node dev-server.mjs            # serve the PWA on :5173 AND spawn the API (server/) on :8080
//   node dev-server.mjs --no-api   # serve only the PWA (API started elsewhere)
//   PWA_PORT=3000 node dev-server.mjs
//
// The PWA is a static site; in production it's on GitHub Pages and talks to the API over a
// Tailscale Funnel hostname. Locally we serve the static files here and point the app at the
// dev API via Settings → Server Sync (default http://127.0.0.1:8080).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PWA_PORT || 5173);
const NO_API = process.argv.includes('--no-api');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

// Only top-level PWA assets are served. Anything with a path separator, dotfile, or that resolves
// outside the repo root is rejected — so the API source and secrets in server/ are never exposed.
const BLOCKED = new Set(['dev-server.mjs', 'package.json', 'package-lock.json']);

const server = createServer(async (req, res) => {
  try {
    let name = decodeURIComponent((req.url || '/').split('?')[0]);
    if (name === '/' || name === '') name = 'index.html';
    name = name.replace(/^\/+/, '');

    if (name.includes('/') || name.includes('..') || name.startsWith('.') || BLOCKED.has(name)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const filePath = resolve(ROOT, name);
    if (dirname(filePath) !== ROOT) { res.writeHead(404).end('Not found'); return; }

    const s = await stat(filePath).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404).end('Not found'); return; }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      // No caching in dev so edits to index.html show up on reload.
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end('Server error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  PWA   →  http://127.0.0.1:${PORT}`);
  if (NO_API) console.log('  API   →  start it yourself: cd server && npm start');
});

// Spawn the API server as a child so one command runs the whole stack.
let api = null;
if (!NO_API) {
  const serverDir = join(ROOT, 'server');
  api = spawn('node', ['src/server.js'], { cwd: serverDir, stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
  api.on('exit', (code) => {
    if (code) console.error(`\n  API exited (code ${code}). Is :8080 already in use, or is server/.env missing?`);
  });
  console.log('  API   →  http://127.0.0.1:8080  (admin: http://127.0.0.1:8080/admin)\n');
}

function shutdown() {
  if (api && !api.killed) api.kill('SIGINT');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
