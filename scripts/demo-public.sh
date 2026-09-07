#!/usr/bin/env bash
# demo-public.sh — zero-cost public demo fallback.
#
# Starts the existing app locally (unchanged architecture, single Express
# server serving both `/` and `/portal/`) and exposes it via a Cloudflare
# "quick tunnel" (cloudflared), which needs no Cloudflare account and no
# DNS setup. Prints the public HTTPS URL once the tunnel is up.
#
# This does NOT change business logic, add a second service, or expose
# anything beyond the app's own HTTP port — no local files, secrets, or
# other ports are shared. SILPO_MODE defaults to mock unless already set
# in the environment, so no Silpo credentials are required or exposed.
#
# Requires `cloudflared` to be installed locally:
#   brew install cloudflared        (macOS)
#   https://github.com/cloudflare/cloudflared/releases  (other platforms)
#
# Usage: npm run demo:public

set -euo pipefail

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. Install it first:"
  echo "  macOS:   brew install cloudflared"
  echo "  Other:   https://github.com/cloudflare/cloudflared/releases"
  exit 1
fi

PORT="${PORT:-3000}"
export SILPO_MODE="${SILPO_MODE:-mock}"

echo "[demo:public] Starting app on port $PORT (SILPO_MODE=$SILPO_MODE)..."
node src/server.js > /tmp/silpo-demo-app.log 2>&1 &
APP_PID=$!

cleanup() {
  echo ""
  echo "[demo:public] Shutting down (app pid $APP_PID)..."
  kill "$APP_PID" 2>/dev/null || true
  [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for the app to actually respond before starting the tunnel.
for i in $(seq 1 20); do
  if curl -s -o /dev/null "http://localhost:$PORT/api/meta/silpo-mode"; then
    break
  fi
  sleep 0.5
done

echo "[demo:public] Starting Cloudflare quick tunnel..."
cloudflared tunnel --url "http://localhost:$PORT" --loglevel info > /tmp/silpo-demo-tunnel.log 2>&1 &
TUNNEL_PID=$!

# cloudflared prints the assigned *.trycloudflare.com URL to its log once
# the tunnel registers — poll for it rather than guessing a fixed delay.
URL=""
for i in $(seq 1 40); do
  URL=$(grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' /tmp/silpo-demo-tunnel.log | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "[demo:public] Tunnel did not come up in time. Log:"
  cat /tmp/silpo-demo-tunnel.log
  exit 1
fi

echo ""
echo "=================================================================="
echo " Public demo URL:      $URL"
echo " Main app:             $URL/"
echo " Demo Office Portal:   $URL/portal/"
echo "=================================================================="
echo ""
echo "Press Ctrl+C to stop both the app and the tunnel."

wait "$APP_PID"
