#!/usr/bin/env python3
"""PreToolUse guard: never let an agent kill or stop the live Fixie phone line mid-call.

The live line is the systemd service `fixie` (tunnel + server + watchdog). Restarts must go through
server/scripts/safe-restart.sh, which waits until Vapi reports no active calls.
"""
import json
import re
import sys

MSG = (
    "BLOCKED: this could kill the LIVE Fixie phone line (systemd service `fixie`) during a call. "
    "Don't kill node/tsx/cloudflared by name, port, or pattern. "
    "To restart the live line, run: server/scripts/safe-restart.sh "
    "(it waits until no calls are active). For test servers, start your own on a port >= 3200 "
    "and kill only that exact PID with `kill <pid>`."
)

RULES = [
    r"\bpkill\b",
    r"\bkillall\b",
    r"\bfuser\b[^|;&]*-k",
    r"systemctl\s+(kill|stop|disable|mask)\s+fixie",
    r"\bkill\b[^|;&]*\$\((pgrep|pidof|lsof|ss|fuser)",
    r"\b(pgrep|pidof|lsof)\b[^|;&]*\|\s*xargs\s+kill",
    r"\bkill\b.*:3000\b",
    r"\blsof\b[^|;&]*:3000[^|;&]*\|[^|;&]*kill",
]

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if data.get("tool_name") != "Bash":
    sys.exit(0)
cmd = (data.get("tool_input") or {}).get("command", "")
for rule in RULES:
    if re.search(rule, cmd):
        print(MSG, file=sys.stderr)
        sys.exit(2)
sys.exit(0)
