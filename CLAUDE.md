# Fixie repo rules (all threads)

## The live phone line: never interrupt it
- The live line (+1 619-771-1086) is the systemd service **`fixie`**: a cloudflared tunnel, the server on :3000, and a watchdog (`server/scripts/supervise.sh`).
- **Never** kill node/tsx/cloudflared by name, pattern, or port, and never `systemctl stop/kill fixie`. A hook blocks these commands.
- To pick up server code changes, run **`server/scripts/safe-restart.sh`**. It waits until Vapi reports no active calls (max 10 min).
- For testing, run your own instance with `DRY_RUN=1` on a port ≥ 3200 (or use the `verify` skill), and kill only that exact PID.
- Logs: `journalctl -u fixie -f` (watchdog), `/var/log/fixie-server.log` (server). Current public URL: `/run/fixie/public-url`.
- Never read the root `.env`.
