#!/usr/bin/env bash
# Provision the picker inventory server inside a fresh Debian 12 LXC container.
# Run as root INSIDE the container:
#     bash setup.sh
#
# Idempotent: safe to re-run to pull new code and restart. It does NOT run `tailscale up`
# or configure serve/funnel — those are interactive / one-time and are in DEPLOY.md.
set -euo pipefail

REPO="${REPO:-https://github.com/braenriquez/picker-app.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/picker-app}"
CORS_ORIGIN_DEFAULT="https://braenriquez.github.io"

echo "==> Base packages + Node 22 + build toolchain (for better-sqlite3)"
apt-get update -y
apt-get install -y curl git ca-certificates python3 build-essential
if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> Tailscale"
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh

echo "==> Service user"
id -u picker &>/dev/null || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin picker

echo "==> Fetch app ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --all -q
  git -C "$APP_DIR" checkout -q "$BRANCH"
  git -C "$APP_DIR" pull -q
else
  git clone -q --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

echo "==> npm install (runtime deps only)"
cd "$APP_DIR/server"
npm install --omit=dev --no-audit --no-fund

echo "==> .env (created once; edit afterwards)"
if [ ! -f "$APP_DIR/server/.env" ]; then
  JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
  WH=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
  cat > "$APP_DIR/server/.env" <<EOF
DB_PATH=$APP_DIR/server/data/inventory.db
HOST=127.0.0.1
PORT=8080
JWT_SECRET=$JWT
JWT_TTL=3600
WEBHOOK_SECRET=$WH
WEBHOOK_FROM_ALLOWLIST=CHANGE_ME@yourdomain.com
ADMIN_HEADER=tailscale-user-login
ADMIN_DEV_BYPASS=0
ENABLE_ENVELOPE=0
CORS_ORIGIN=$CORS_ORIGIN_DEFAULT
EOF
  echo "   -> wrote $APP_DIR/server/.env  (secrets generated; set WEBHOOK_FROM_ALLOWLIST)"
else
  echo "   -> exists, left untouched"
fi

echo "==> Data dir + ownership + DB schema"
mkdir -p "$APP_DIR/server/data"
chown -R picker:picker "$APP_DIR"
sudo -u picker bash -lc "cd $APP_DIR/server && npm run init-db"

echo "==> systemd service"
cp "$APP_DIR/deploy/picker-inventory.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now picker-inventory
sleep 1
systemctl --no-pager --full status picker-inventory | head -6 || true

cat <<'NEXT'

==> App is running on 127.0.0.1:8080. Remaining one-time steps (see DEPLOY.md):
    1) tailscale up --hostname=picker
    2) Tailscale admin console: enable HTTPS Certificates, and allow Funnel for this node
    3) tailscale serve  --bg --https=8443 http://127.0.0.1:8080
       tailscale funnel --bg --https=443 --set-path=/api http://127.0.0.1:8080/api
    4) Edit WEBHOOK_FROM_ALLOWLIST in server/.env, then: systemctl restart picker-inventory
NEXT
