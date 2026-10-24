#!/usr/bin/env bash
# The ONLY supported way to restart the live Fixie line. systemd's ExecStop waits for active calls to end.
set -euo pipefail
echo "Restarting fixie (waits until Vapi reports no active calls, max 5 min)…"
systemctl restart fixie
sleep 3
systemctl is-active fixie && echo "URL: $(cat /run/fixie/public-url 2>/dev/null)"
