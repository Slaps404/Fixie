#!/usr/bin/env bash
# Keeps the live Fixie line up: cloudflared quick tunnel + server, with a health watchdog.
# Run under systemd (deploy/fixie.service). Restarts the server if it dies, and restarts
# tunnel + server if the public URL stops answering. The server's boot step re-points the
# Vapi intake assistant at the current tunnel URL, so a new URL needs no manual setup.
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
STATE=/run/fixie
mkdir -p "$STATE"
TUNNEL_LOG="$STATE/cloudflared.log"
SERVER_LOG="${SERVER_LOG:-/var/log/fixie-server.log}"

tunnel_pid=""; server_pid=""; url=""; tunnel_started=0

log() { echo "[supervise $(date +%H:%M:%S)] $*"; }

stop_server() { [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null; wait "$server_pid" 2>/dev/null; server_pid=""; }
stop_tunnel() { [ -n "$tunnel_pid" ] && kill "$tunnel_pid" 2>/dev/null; wait "$tunnel_pid" 2>/dev/null; tunnel_pid=""; }
cleanup() { log "stopping"; stop_server; stop_tunnel; exit 0; }
trap cleanup TERM INT

start_tunnel() {
  stop_tunnel
  : > "$TUNNEL_LOG"
  cloudflared tunnel --no-autoupdate --protocol http2 --url "http://localhost:$PORT" >> "$TUNNEL_LOG" 2>&1 &
  tunnel_pid=$!
  url=""
  for _ in $(seq 1 60); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1)
    [ -n "$url" ] && break
    sleep 1
  done
  if [ -z "$url" ]; then log "tunnel gave no URL"; return 1; fi
  echo "$url" > "$STATE/public-url"
  tunnel_started=$(date +%s)
  log "tunnel up: $url"
}

start_server() {
  stop_server
  ( cd "$DIR" && exec env PUBLIC_URL="$url" PORT="$PORT" node --import tsx ./src/index.ts ) >> "$SERVER_LOG" 2>&1 &
  server_pid=$!
  for _ in $(seq 1 30); do
    curl -fsS -m 2 "http://localhost:$PORT/health" >/dev/null 2>&1 && { log "server up (pid $server_pid)"; return 0; }
    sleep 1
  done
  log "server did not become healthy"; return 1
}

until start_tunnel; do sleep 5; done
start_server

public_fails=0
while true; do
  sleep 10 & wait $!
  if ! kill -0 "$tunnel_pid" 2>/dev/null; then
    log "tunnel died: restarting tunnel + server"
    until start_tunnel; do sleep 5; done
    start_server; public_fails=0; continue
  fi
  if ! kill -0 "$server_pid" 2>/dev/null || ! curl -fsS -m 3 "http://localhost:$PORT/health" >/dev/null 2>&1; then
    log "server unhealthy: restarting server"
    start_server; continue
  fi
  # New quick tunnels need ~10-30 s of DNS warm-up before the public URL resolves.
  if [ $(( $(date +%s) - tunnel_started )) -lt 45 ]; then continue; fi
  if curl -fsS -m 5 "$url/health" >/dev/null 2>&1; then
    public_fails=0
  else
    public_fails=$((public_fails + 1))
    log "public health failed ($public_fails/3)"
    if [ "$public_fails" -ge 3 ]; then
      log "public URL dead: restarting tunnel + server"
      until start_tunnel; do sleep 5; done
      start_server; public_fails=0
    fi
  fi
done
