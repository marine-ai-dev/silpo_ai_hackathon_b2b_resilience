#!/usr/bin/env bash
# demo-public.sh — zero-cost public demo fallback.
#
# Starts the existing app locally (unchanged architecture, single Express
# server serving both `/` and `/portal/`) and exposes it publicly via a
# free tunnel. Prints the public HTTPS URL once the tunnel is up.
#
# Primary path: Cloudflare "quick tunnel" (cloudflared) — no account, no
# DNS setup, the standard option on a normal network.
# Automatic fallback: an SSH tunnel via localhost.run (also free/
# accountless, uses outbound SSH on port 22 instead of an HTTPS API host)
# — used automatically if cloudflared can't reach trycloudflare.com's
# registration API (some restrictive/sandboxed networks allow SSH egress
# but block that specific host).
#
# This does NOT change business logic, add a second service, or expose
# anything beyond the app's own HTTP port — no local files, secrets, or
# other ports are shared. SILPO_MODE defaults to mock unless already set
# in the environment, so no Silpo credentials are required or exposed.
#
# cloudflared install (optional — the script falls back to SSH without it):
#   brew install cloudflared        (macOS)
#   https://github.com/cloudflare/cloudflared/releases  (other platforms)
#
# Usage: npm run demo:public

set -euo pipefail

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

URL=""

if command -v cloudflared >/dev/null 2>&1; then
  echo "[demo:public] Starting Cloudflare quick tunnel..."
  cloudflared tunnel --url "http://localhost:$PORT" --loglevel info > /tmp/silpo-demo-tunnel.log 2>&1 &
  TUNNEL_PID=$!

  # cloudflared prints the assigned <random-words>.trycloudflare.com URL to
  # its log once the tunnel registers. Exclude the bare api.trycloudflare.com
  # / trycloudflare.com hosts that appear in its own status/diagnostic lines
  # ("Requesting new quick Tunnel on trycloudflare.com...") so those aren't
  # mistaken for the assigned tunnel URL. Also bail out immediately (rather
  # than waiting the full timeout) if cloudflared logs an explicit failure.
  for i in $(seq 1 20); do
    URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' /tmp/silpo-demo-tunnel.log | grep -v -E '^https://(api\.)?trycloudflare\.com$' | head -1 || true)
    [ -n "$URL" ] && break
    if grep -q "failed to request quick Tunnel" /tmp/silpo-demo-tunnel.log; then
      break
    fi
    sleep 1
  done

  if [ -z "$URL" ]; then
    echo "[demo:public] cloudflared did not register in time (likely blocked network egress to trycloudflare.com) — falling back to an SSH tunnel."
    kill "$TUNNEL_PID" 2>/dev/null || true
    TUNNEL_PID=""
  fi
else
  echo "[demo:public] cloudflared not installed — using SSH tunnel fallback."
fi

if [ -z "$URL" ]; then
  echo "[demo:public] Starting SSH tunnel via localhost.run..."
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R "80:localhost:$PORT" nokey@localhost.run > /tmp/silpo-demo-tunnel-ssh.log 2>&1 &
  TUNNEL_PID=$!

  for i in $(seq 1 30); do
    URL=$(grep -o 'https://[a-zA-Z0-9.-]*\.lhr\.life' /tmp/silpo-demo-tunnel-ssh.log | head -1 || true)
    [ -n "$URL" ] && break
    sleep 1
  done
fi

if [ -z "$URL" ]; then
  echo "[demo:public] Neither cloudflared nor the SSH fallback produced a public URL in time. Logs:"
  cat /tmp/silpo-demo-tunnel.log 2>/dev/null || true
  cat /tmp/silpo-demo-tunnel-ssh.log 2>/dev/null || true
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
