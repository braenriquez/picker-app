# Picker Inventory Server

Centralized inventory backend for the Gruppo Bravo picker PWA (Option A: Tailscale Funnel).

- **Public surface** — only `/api/*`, exposed via `tailscale funnel`. Bearer-token gated.
- **Admin** — `/admin/*`, reachable **only** over your tailnet via `tailscale serve`. Generates
  connection keys, manages category assignment, manual upload, version rollback.
- **Email ingest** — `/webhook/email`, HMAC-signed, sender-allowlisted.
- Parsers are a **verbatim port** of the in-browser parsers in `../index.html`, so server-side
  parsing produces byte-identical inventory.

## Architecture

```
forwarded email ──▶ Cloudflare Email Routing ──▶ Worker (HMAC) ──▶ POST /webhook/email
                                                                        │
   admin (tailnet only) ── tailscale serve ──▶ /admin  ── manual upload ┤
                                                                        ▼
                                                              ┌──────────────────┐
                                                              │  parse + classify │
                                                              │  → new version    │  SQLite
                                                              └──────────────────┘
                                                                        │
   PWA users ── tailscale funnel ──▶ /api/auth → /api/inventory ◀───────┘
```

## Setup

```bash
cd server
npm install
cp .env.example .env        # then edit: set JWT_SECRET, WEBHOOK_SECRET, allowlist
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # for the secrets
npm run init-db
npm start
```

Generate a first connection key and ingest a spreadsheet without the UI:

```bash
npm run newkey -- "Jose's iPad"
npm run ingest -- /path/to/Inventory.xlsx
```

### Local dev without Tailscale

Set `ADMIN_DEV_BYPASS=1` in `.env` so `/admin` is reachable on localhost, then open
<http://127.0.0.1:8080/admin>. **Never set this in production** — it disables the tailnet gate.

### Run the PWA + API together

From the **repo root** (one level up), `dev-server.mjs` serves the picker PWA on :5173 and spawns
this API on :8080 in one command:

```bash
node dev-server.mjs            # PWA → http://127.0.0.1:5173 , API → :8080 , admin → :8080/admin
node dev-server.mjs --no-api   # PWA only (API started separately)
```

Then in the PWA: **Settings → Server Sync** → the Server URL defaults to `http://127.0.0.1:8080`;
paste a connection key (generate one in the admin dashboard) and hit **Refresh Inventory**. The
service worker is disabled on localhost so edits to `index.html` show up on reload, and the API
sends CORS + `Access-Control-Expose-Headers: ETag, X-Inventory-Version` so the cross-origin sync
works. In production set Server URL to your Funnel hostname and `CORS_ORIGIN` to the Pages origin.

## Exposing it with Tailscale

`tailscale serve` = tailnet-only. `tailscale funnel` = public internet. TLS terminates **on this
box** (Let's Encrypt cert provisioned automatically), so no third party sees plaintext inventory.

```bash
# Admin UI — tailnet only, on https://<machine>.<tailnet>.ts.net:8443
tailscale serve --bg --https=8443 http://127.0.0.1:8080

# Public API — only the /api path is funneled; /admin stays unreachable from outside
tailscale funnel --bg --https=443 --set-path=/api http://127.0.0.1:8080/api
```

Enable Funnel for the node first in the admin console (Settings → Funnel). The admin gate relies
on the `Tailscale-User-Login` header that Serve injects and Funnel never sends.

## Endpoints

### Public `/api/*` (Funnel)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth` | `{ key }` → `{ token, expires_at }` (JWT, 1 h) |
| GET | `/api/inventory` | Bearer token; gzipped JSON `{ items, unclassified }`; honours `If-None-Match` → 304 |
| GET | `/api/inventory.enc` | only when `ENABLE_ENVELOPE=1` — ciphertext + this key's wrapped content key |
| GET | `/api/health` | liveness |

### Admin `/admin/*` (Serve, tailnet only)
`GET /admin` dashboard · `POST/GET /admin/api/keys` · `POST /admin/api/keys/:id/revoke` ·
`GET/POST /admin/api/overrides` · `POST /admin/api/inventory/upload` (multipart) ·
`GET /admin/api/versions` · `POST /admin/api/versions/:id/{activate,rebuild}` · `GET /admin/api/ingest-log`

### Email `/webhook/email`
`POST` with header `X-Signature: hmac-sha256(WEBHOOK_SECRET, rawBody)` and body
`{ from, subject, attachments:[{ name, content_base64 }] }`. Rejects bad HMAC or non-allowlisted sender.

## Encryption — the three layers

1. **Transport** (default, free) — Funnel TLS terminates here; no third party sees plaintext.
2. **At rest** — put `data/` on a LUKS volume. Nothing app-specific.
3. **Envelope** (`ENABLE_ENVELOPE=1`, optional) — the inventory blob is encrypted with a shared
   content key `Kc`; `Kc` is wrapped per connection key using a key derived from that key's secret.
   The server stores only ciphertext + wrapped keys. Devices fetch `/api/inventory.enc`, unwrap
   `Kc` with their secret, and decrypt locally. Keys created **before** enabling envelope have no
   wrapped `Kc` — regenerate them after turning it on.

## Wiring the PWA to the server

The PWA currently parses `.xlsx` in-browser. Point it at the server instead — add a Settings field
for the connection key and a refresh button. Minimal client (transport-only, layer 1):

```js
// Settings: persist the connection key the user pastes in
const CONN_KEY = 'gb_connkey';
function saveConnKey(k){ localStorage.setItem(CONN_KEY, k.trim()); }

const API = 'https://<machine>.<tailnet>.ts.net';  // your funnel hostname

async function refreshFromServer(){
  const key = localStorage.getItem(CONN_KEY);
  if(!key){ showToast('Enter your connection key in Settings'); return; }
  const a = await fetch(API + '/api/auth', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ key })
  });
  if(!a.ok){ showToast('Key rejected'); return; }
  const { token } = await a.json();

  const etag = localStorage.getItem('gb_inv_etag') || '';
  const r = await fetch(API + '/api/inventory', {
    headers:{ Authorization:'Bearer '+token, 'If-None-Match': etag }
  });
  if(r.status === 304){ showToast('Already up to date'); return; }
  if(!r.ok){ showToast('Refresh failed'); return; }

  const data = await r.json();            // { items, unclassified }
  inventory   = data.items;
  unclassified = data.unclassified || [];
  save(SK.inventory, inventory);
  save(SK.unclassified, unclassified);
  localStorage.setItem('gb_inv_etag', r.headers.get('ETag') || '');
  renderFindPage(); renderReviewNav();
  showToast(`Refreshed ${inventory.length} items`);
}
```

The blob shape (`{ items, unclassified }`) is exactly what `importFile()` produces today, so the
existing filter/render code in `index.html` is a drop-in target — no parser changes needed in the PWA.

For envelope mode, fetch `/api/inventory.enc`, then with `libsodium-wrappers`:
unwrap `Kc = secretbox_open(wrapped_kc, key=generichash(secret))`, then
`gunzip(secretbox_open(blob_ct, Kc))` → the same JSON.
