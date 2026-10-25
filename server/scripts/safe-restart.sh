#!/usr/bin/env bash
# The ONLY supported way to restart the live Fixie line. systemd's ExecStop waits for active calls to end.
set -euo pipefail
cd "$(dirname "$0")/.."
# Never ship a broken build: typecheck + unit tests must pass first (SKIP_CHECKS=1 only for emergencies).
if [ "${SKIP_CHECKS:-0}" != "1" ]; then
  echo "Checking build before restart…"
  npx tsc --noEmit || { echo "ABORT: typecheck failed; live line untouched."; exit 1; }
  npm test 2>&1 | tail -n 20 | grep -q "^# fail 0" || { echo "ABORT: tests failed; live line untouched."; exit 1; }
fi
echo "Restarting fixie (waits until Vapi reports no active calls, max 10 min)…"
systemctl restart fixie
sleep 3
systemctl is-active fixie && echo "URL: $(cat /run/fixie/public-url 2>/dev/null)"
