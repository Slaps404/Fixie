#!/usr/bin/env bash
# Fixie verification driver. Runs a disposable, keyless, sim-only copy of server/ so a
# verification run can never place a real phone call, touch the dev instance's data/, or
# clobber the demo's events.jsonl. Usage: fixie-verify.sh <command> [args]  (see SKILL.md)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
RUN_ID="${RUN_ID:-}"
STATE_ROOT="${TMPDIR:-/tmp}/fixie-verify"
ARTIFACTS_ROOT="$REPO/.verify-artifacts"
ADMIN="fixie-verify"

die() { echo "fixie-verify: $*" >&2; exit 1; }
need_run() {
  [ -n "$RUN_ID" ] || RUN_ID="$(cat "$STATE_ROOT/current" 2>/dev/null || true)"
  [ -n "$RUN_ID" ] || die "no run: start one with 'launch' or set RUN_ID"
  RUN="$STATE_ROOT/$RUN_ID"; [ -d "$RUN" ] || die "run $RUN_ID not found under $STATE_ROOT"
  PORT="$(cat "$RUN/port")"; BASE="http://127.0.0.1:$PORT"; ART="$ARTIFACTS_ROOT/$RUN_ID"
}
port_ours() {
  local lpid; lpid="$(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
  [ -n "$lpid" ] && [ "$(ps -o pgid= -p "$lpid" | tr -d ' ')" = "$(cat "$RUN/pid")" ]
}
pid_alive() { [ -f "$RUN/pid" ] && kill -0 "$(cat "$RUN/pid")" 2>/dev/null; }

cmd_launch() {
  local port="${1:-3100}" speed="${SIM_SPEED:-4}"
  if ss -ltn "sport = :$port" 2>/dev/null | grep -q LISTEN; then die "port $port is in use; pass another: launch <port>"; fi
  RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)-$$}"; RUN="$STATE_ROOT/$RUN_ID"; ART="$ARTIFACTS_ROOT/$RUN_ID"
  mkdir -p "$RUN" "$ART"
  # Snapshot the code under test. .env is deliberately NOT copied: no keys => config.dryRun => every lane is sim.
  mkdir -p "$RUN/server/data"
  cp -r "$REPO/server/src" "$REPO/server/scripts" "$REPO/server/test" "$REPO/server/public" "$RUN/server/"
  cp "$REPO/server/package.json" "$REPO/server/tsconfig.json" "$RUN/server/"
  ln -s "$REPO/server/node_modules" "$RUN/server/node_modules"
  # Entry renamed (and tsx loaded via NODE_OPTIONS) so other sessions' `pkill -f tsx` / `pkill -f index.ts` miss us.
  echo "import './index.ts';" > "$RUN/server/src/fixie-verify-main.ts"
  cp -r "$REPO/server/data/parts.json" "$REPO/server/data/online-prices.json" "$REPO/server/data/faults" "$RUN/server/data/"
  # Fake 555 roster only, never the real roster.json (it holds teammates' phones).
  cp "$REPO/server/data/roster.example.json" "$RUN/server/data/roster.json"
  echo "$port" > "$RUN/port"; echo "$RUN_ID" > "$STATE_ROOT/current"
  { git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo "no commits"; date -u +%FT%TZ; } > "$ART/build.txt"
  (cd "$REPO/server" && find src scripts -type f -name '*.ts' -print0 | sort -z | xargs -0 sha1sum) > "$ART/source-manifest.txt"
  (
    cd "$RUN/server"
    env -i PATH="$PATH" HOME="$HOME" PORT="$port" DRY_RUN=1 VAPI_API_KEY= PUBLIC_URL= \
      ANTHROPIC_API_KEY= ADMIN_TOKEN="$ADMIN" SIM_SPEED="$speed" \
      NODE_OPTIONS="--import=$REPO/server/node_modules/tsx/dist/esm/index.mjs" \
      setsid node src/fixie-verify-main.ts > "$ART/server.log" 2>&1 &
    echo $! > "$RUN/pid"
  )
  BASE="http://127.0.0.1:$port"
  for _ in $(seq 1 60); do
    if curl -fsS "$BASE/health" >/dev/null 2>&1; then break; fi
    pid_alive || { tail -30 "$ART/server.log" >&2; die "server exited during boot (log: $ART/server.log)"; }
    sleep 0.5
  done
  curl -fsS "$BASE/health" >/dev/null 2>&1 || die "server not answering /health after 30s (log: $ART/server.log)"
  echo "RUN_ID=$RUN_ID"; echo "BASE=$BASE"; echo "ARTIFACTS=$ART"
  cmd_doctor
}

cmd_doctor() {
  need_run
  local ok=1 h
  check() { if eval "$2"; then echo "  ✅ $1"; else echo "  ❌ $1"; ok=0; fi; }
  echo "doctor: run $RUN_ID at $BASE"
  check "process $(cat "$RUN/pid" 2>/dev/null) alive (started by this run)" pid_alive
  check "port $PORT owned by our process group" port_ours
  h="$(curl -fsS "$BASE/health" 2>/dev/null || true)"
  check "/health ok: $h" "[ -n '$h' ] && echo '$h' | grep -q '\"ok\":true'"
  check "dryRun=true (no real calls possible)" "echo '$h' | grep -q '\"dryRun\":true'"
  check "no .env in the run copy" "[ ! -e '$RUN/server/.env' ]"
  check "roster is the fake 555 example" "! grep -qv '555' <(grep -o '\"phone\": *\"[^\"]*\"' '$RUN/server/data/roster.json')"
  for r in "GET /jobs" "GET /events.json" "POST /demo/reset"; do
    local m="${r%% *}" p="${r#* }" code
    code="$(curl -s -o /dev/null -w '%{http_code}' -X "$m" -H "x-admin: $ADMIN" "$BASE$p")"
    if [ "$code" = 404 ]; then echo "  ⚠️  $r → 404 (route not built yet: src/routes.ts)"; else echo "  ✅ $r → $code"; fi
  done
  [ "$ok" = 1 ] || die "doctor failed; do not drive this instance"
}

# Raw HTTP against the instance, with the admin header. Body via stdin or 3rd arg.
cmd_api() {
  need_run
  local m="$1" p="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -w '\nHTTP %{http_code}\n' -X "$m" -H 'Content-Type: application/json' -H "x-admin: $ADMIN" -d "$body" "$BASE$p"
  else
    curl -sS -w '\nHTTP %{http_code}\n' -X "$m" -H "x-admin: $ADMIN" "$BASE$p"
  fi
}

# Wait until an event matching a jq filter appears, e.g.  wait-event '.type=="guard" and .data.kind=="budget"' 60
cmd_wait_event() {
  need_run
  local filter="$1" timeout="${2:-60}" t=0
  while [ "$t" -lt "$timeout" ]; do
    if curl -fsS "$BASE/events.json?since=0" | jq -e "[.[] | select($filter)] | length > 0" >/dev/null 2>&1; then
      curl -fsS "$BASE/events.json?since=0" | jq -c "[.[] | select($filter)][0]"; return 0
    fi
    sleep 1; t=$((t+1))
  done
  die "timed out after ${timeout}s waiting for event: $filter"
}

# Wait for the newest job to reach a state.
cmd_wait_state() {
  need_run
  local want="$1" timeout="${2:-90}" t=0 s=""
  while [ "$t" -lt "$timeout" ]; do
    s="$(curl -fsS "$BASE/jobs" 2>/dev/null | jq -r '(if type=="array" then . else .jobs end) | sort_by(.createdAt) | last | .state // empty' 2>/dev/null || true)"
    [ "$s" = "$want" ] && { echo "$s"; return 0; }
    case "$s" in STOPPED|ESCALATED|DECLINED) [ "$want" = "$s" ] || die "job reached $s while waiting for $want";; esac
    sleep 1; t=$((t+1))
  done
  die "timed out after ${timeout}s waiting for state $want (last: ${s:-no job})"
}

# The repo's own end-to-end sim driver, pointed at this instance. Transcript saved as evidence.
cmd_demo_sim() {
  need_run
  (cd "$RUN/server" && env -i PATH="$PATH" HOME="$HOME" BASE="$BASE" ADMIN_TOKEN="$ADMIN" \
    node_modules/.bin/tsx scripts/demo-sim.ts) 2>&1 | tee "$ART/demo-sim.txt"
  return "${PIPESTATUS[0]}"
}

# Typecheck + unit tests on the snapshot (no server needed). Uses the live tree if no run exists.
cmd_check() {
  local dir="$REPO/server" out="${ART:-}"
  if RUN_ID="${RUN_ID:-$(cat "$STATE_ROOT/current" 2>/dev/null || true)}" && [ -n "$RUN_ID" ] && [ -d "$STATE_ROOT/$RUN_ID" ]; then
    need_run; dir="$RUN/server"; out="$ART"
  fi
  out="${out:-$ARTIFACTS_ROOT/check-$(date +%Y%m%d-%H%M%S)}"; mkdir -p "$out"
  local rc=0
  (cd "$dir" && node_modules/.bin/tsc --noEmit) > "$out/typecheck.txt" 2>&1 && echo "  ✅ typecheck" || { echo "  ❌ typecheck ($out/typecheck.txt)"; rc=1; }
  (cd "$dir" && env -i PATH="$PATH" HOME="$HOME" DRY_RUN=1 node --import tsx --test test/*.test.ts) > "$out/test.txt" 2>&1 \
    && echo "  ✅ tests: $(grep -E '^# (pass|fail)' "$out/test.txt" | tr '\n' ' ')" \
    || { echo "  ❌ tests: $(grep -E '^# (pass|fail)' "$out/test.txt" | tr '\n' ' ') ($out/test.txt)"; rc=1; }
  return $rc
}

# Freeze evidence: events, jobs, jsonl log. Name it after the feature being proved.
cmd_capture() {
  need_run
  local name="${1:-snapshot}"
  curl -fsS "$BASE/events.json?since=0" > "$ART/$name.events.json"
  curl -fsS "$BASE/jobs" > "$ART/$name.jobs.json" 2>/dev/null || echo '{"error":"GET /jobs unavailable"}' > "$ART/$name.jobs.json"
  cp "$RUN/server/data/events.jsonl" "$ART/$name.events.jsonl" 2>/dev/null || true
  echo "captured → $ART/$name.*  ($(jq length "$ART/$name.events.json") events)"
  jq -r '.[] | "\(.id)\t\(if .simulated then "SIM" else "   " end)\t\(.type)\t\(.data|tostring|.[0:120])"' "$ART/$name.events.json" > "$ART/$name.timeline.tsv"
}

# Send ONE Vapi-shaped install_progress tool call for the newest job, as the delivery lane would.
# This is the production boundary (Vapi -> /vapi/webhook), not a test-only route. Prints the tool result.
cmd_probe_install() {
  need_run
  local step="${1:?step number}" job epoch rnd
  job="$(curl -fsS "$BASE/jobs" | jq -r 'sort_by(.createdAt) | last | .id')"
  epoch="$(cat "$RUN/epoch" 2>/dev/null || echo 1)"
  rnd="$RANDOM$RANDOM"
  jq -nc --arg j "$job" --arg r "$rnd" --argjson e "$epoch" --argjson s "$step" '{message:{type:"tool-calls",
    call:{id:"probe_\($j)_\($s)",name:"\($j)||delivery",type:"outboundPhoneCall",customer:{number:"+16195550100"},
          assistant:{metadata:{jobId:$j,lane:"delivery",epoch:$e}}},
    toolCallList:[{id:"tc_probe_\($j)_\($s)_\($e)_\($r)",type:"function",function:{name:"install_progress",arguments:{step:$s}}}],
    toolWithToolCallList:[{type:"function",function:{name:"install_progress"},
      toolCall:{id:"tc_probe_\($j)_\($s)_\($e)_\($r)",type:"function",function:{name:"install_progress",arguments:{step:$s}}}}]}}' \
  | curl -sS -H 'Content-Type: application/json' -d @- "$BASE/vapi/webhook" | jq -r '.results[0].result'
}

# Reset the demo and remember the new epoch (webhooks carrying an old epoch are ignored).
cmd_reset() {
  need_run
  curl -fsS -X POST -H "x-admin: $ADMIN" "$BASE/demo/reset" | tee /dev/stderr | jq -r .epoch > "$RUN/epoch"
}

cmd_cleanup() {
  need_run
  if pid_alive; then
    local pid; pid="$(cat "$RUN/pid")"
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    kill -9 -- "-$pid" 2>/dev/null || true
  fi
  [ -d "$ART" ] && cp "$ART/server.log" "$ART/server.final.log" 2>/dev/null || true
  rm -rf "$RUN"
  [ "$(cat "$STATE_ROOT/current" 2>/dev/null)" = "$RUN_ID" ] && rm -f "$STATE_ROOT/current"
  echo "cleaned run $RUN_ID; evidence kept at $ART"
  ls "$ART"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  launch) cmd_launch "$@";;
  doctor) cmd_doctor;;
  api) cmd_api "$@";;
  wait-event) cmd_wait_event "$@";;
  wait-state) cmd_wait_state "$@";;
  demo-sim) cmd_demo_sim;;
  check) cmd_check;;
  capture) cmd_capture "$@";;
  probe-install) cmd_probe_install "$@";;
  reset) cmd_reset;;
  cleanup) cmd_cleanup;;
  *) sed -n '2,4p' "$0"; echo "commands: launch [port] | doctor | api METHOD PATH [json] | wait-event JQ [s] | wait-state STATE [s] | reset | probe-install STEP | demo-sim | check | capture NAME | cleanup"; exit 2;;
esac
