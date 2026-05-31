# Deploying the picker inventory server on Proxmox (LXC + Tailscale Funnel)

Target shape:
- **LXC container** on Proxmox running the Node + SQLite API as a systemd service on `127.0.0.1:8080`.
- **Tailscale Serve** → admin dashboard, **tailnet-only**, at `https://picker.tail951d9a.ts.net:8443/admin`.
- **Tailscale Funnel** → `/api`, **public** (so off-tailnet phones can sync), at `https://picker.tail951d9a.ts.net/api`.
- **PWA** stays on GitHub Pages; users paste a connection key in Settings → Server Sync.

Values below assume your tailnet `tail951d9a.ts.net` and Pages origin `https://braenriquez.github.io`.
Replace `<VMID>` and the node hostname (`picker`) as you like.

---

## 1. Create the LXC (on the Proxmox host)

GUI: *Create CT* → unprivileged, Debian 12 template, 1 vCPU, 512 MB RAM, 4 GB disk, a static or
DHCP IP on your LAN. Or CLI:

```bash
pct create <VMID> local:vztmpl/debian-12-standard_*.tar.zst \
  --hostname picker --unprivileged 1 \
  --cores 1 --memory 512 --swap 512 \
  --rootfs local-lvm:4 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --features nesting=1 \
  --onboot 1
```

### Give the container a TUN device (required for Tailscale in unprivileged LXC)

On the **host**, append to `/etc/pve/lxc/<VMID>.conf`:

```
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```

Then start it:

```bash
pct start <VMID>
pct enter <VMID>        # drops you into a root shell in the container
```

---

## 2. Provision the app (inside the container)

```bash
apt-get update && apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/braenriquez/picker-app/main/deploy/setup.sh -o setup.sh
bash setup.sh
```

`setup.sh` installs Node 22, build tools, and Tailscale; clones the repo to `/opt/picker-app`;
runs `npm install`; writes `server/.env` with freshly generated `JWT_SECRET`/`WEBHOOK_SECRET` and
`ADMIN_DEV_BYPASS=0`, `CORS_ORIGIN=https://braenriquez.github.io`; inits the DB; and installs +
starts the `picker-inventory` systemd service.

> If the PR isn't merged to `main` yet, run with the branch:
> `BRANCH=inventory-backend bash setup.sh`

Verify the service locally:

```bash
curl -s localhost:8080/api/health           # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/admin    # 404 — gate is ON (no tailnet header)
```

The 404 on `/admin` is correct: with `ADMIN_DEV_BYPASS=0` the dashboard is unreachable except
through Tailscale Serve (which injects the identity header).

---

## 3. Join the tailnet + expose it

```bash
tailscale up --hostname=picker
```

In the **Tailscale admin console** (one-time):
- **DNS** → enable **HTTPS Certificates** (lets Serve/Funnel get a Let's Encrypt cert for `*.ts.net`).
- **Access controls** → allow Funnel for this node, e.g. add to your policy:
  ```jsonc
  "nodeAttrs": [
    { "target": ["picker"], "attr": ["funnel"] }
  ]
  ```

Then expose the two surfaces:

```bash
# Admin dashboard — tailnet only, HTTPS on 8443
tailscale serve  --bg --https=8443 http://127.0.0.1:8080

# Public API — only the /api path is funneled to the world on 443
tailscale funnel --bg --https=443 --set-path=/api http://127.0.0.1:8080/api

tailscale serve status     # review what's exposed
```

(Optional, only if you wire up email ingest later — funnel the webhook path too:)
```bash
tailscale funnel --bg --https=443 --set-path=/webhook/email http://127.0.0.1:8080/webhook/email
```

---

## 4. Finish config

```bash
# set the address you'll forward inventory emails from, then restart
nano /opt/picker-app/server/.env      # WEBHOOK_FROM_ALLOWLIST=inventory@yourdomain.com
systemctl restart picker-inventory
```

---

## 5. Wire up the clients

- **Admin:** open `https://picker.tail951d9a.ts.net:8443/admin` from any device on your tailnet.
  Upload an inventory `.xlsx` (or use the email webhook), assign categories, and **Generate** a
  connection key per user.
- **PWA (each user's phone):** open the app → **Settings → Server Sync**:
  - **Server URL:** `https://picker.tail951d9a.ts.net`   ← the Funnel host (no port; 443)
  - **Connection key:** the key you generated
  - tap **Refresh Inventory**

The PWA on `https://braenriquez.github.io` is already allowed by `CORS_ORIGIN`.

---

## Verify the security boundary

| Check | Expected |
|---|---|
| `https://picker.tail951d9a.ts.net:8443/admin` from a tailnet device | loads (Serve injects the identity header) |
| `https://picker.tail951d9a.ts.net/admin` from the **public** internet | 404 (Funnel only maps `/api`, and the gate blocks it) |
| `https://picker.tail951d9a.ts.net/api/health` from anywhere | `{"ok":true}` |
| `http://<container-LAN-IP>:8080/admin` from your LAN | 404 (no tailnet header) |

---

## Operations

```bash
journalctl -u picker-inventory -f          # logs
systemctl restart picker-inventory         # restart

# Update to latest code (re-runs install, keeps .env + data):
bash /opt/picker-app/deploy/setup.sh       # or: BRANCH=... bash setup.sh

# Back up everything that matters (DB holds keys, versions, overrides):
tar czf picker-backup-$(date +%F).tgz -C /opt/picker-app/server data .env
```

**At-rest encryption:** the SQLite DB lives in `server/data/`. For encryption at rest, put the
container's disk on an encrypted Proxmox storage (or LUKS on the host), or enable the app's
optional envelope layer (`ENABLE_ENVELOPE=1`) and regenerate connection keys.

**Keeping it alive:** the LXC has `--onboot 1`; the service is `enable`d; Tailscale Serve/Funnel
configs persist across reboots (`--bg`). Nothing to babysit.
