---
name: verify
description: Drive and prove Fixie (the voice repair-line server in server/) end to end the way a caller, supplier, or operator would, using a disposable sim-only instance that can never place a real phone call. Use after any change to server/ (orchestrator, guards, dialer, Vapi webhook/sim, routes), before claiming a slice or issue is done, before a rehearsal, or when someone asks "does the dryer demo still work?"
---

# Verify Fixie

Fixie's user surface is phone calls. In verification, every call is a **sim call**: `server/src/vapi/sim.ts` POSTs Vapi-shaped webhooks into the real `/vapi/webhook → orchestrator → events` path. What the judges see on the board (`web/`) is the event stream, so the proof surface is: **HTTP admin routes in, `/events.json` + `/jobs` out.**

Everything goes through one helper. Run it from the repo root:

```bash
S=.claude/skills/verify/scripts/fixie-verify.sh
```

## Safety rules (read first)

- **Never place live calls from a verification run.** The helper runs a *copy* of `server/` with no `.env`, `DRY_RUN=1`, empty `VAPI_API_KEY`, and the fake `555` roster (`data/roster.example.json`). `doctor` refuses to pass unless `dryRun:true`. Live lanes (real phones, real Vapi spend) need the user's explicit go-ahead each time. See [features/live-lanes.md](features/live-lanes.md).
- **Never read `server/.env`.** Project settings deny it, and a hook guards secrets.
- **Never drive the dev instance** (`:3000`, `server/data/`). Other Claude sessions and the teammate's board use it. The verify instance runs on `:3100` by default, with its own data dir.

## Launch

```bash
$S launch            # or: $S launch 3101   (any free port); SIM_SPEED=4 by default
```

What it does:
- Snapshots `server/{src,scripts,test,package.json,tsconfig.json}` and `data/parts.json` into `/tmp/fixie-verify/<RUN_ID>/server`, and symlinks `node_modules`.
- Starts `node src/fixie-verify-main.ts` under `setsid`, with tsx loaded via `NODE_OPTIONS`.
- Waits for `/health`, then runs `doctor`.

**Ready** = the doctor block is all ✅ and prints `RUN_ID=…`, `BASE=…`, `ARTIFACTS=…`. The run id is saved in `/tmp/fixie-verify/current`, so later commands find it. Set `RUN_ID=` to address a specific run.

Because it's a snapshot, **edits made after launch are not in the instance**. Run `cleanup` and `launch` again to pick them up. `ARTIFACTS/source-manifest.txt` records the sha1 of every source file that was tested.

## Doctor

```bash
$S doctor
```

Read-only. It checks:
- our pid is alive
- the port is owned by our process group
- `/health` reports `dryRun:true`
- there is no `.env` in the copy
- the roster is all `555`
- `/jobs`, `/events.json`, and `/demo/reset` answer (a 404 means `routes.ts` isn't built yet)

Run it first whenever anything looks off. If it fails, don't drive the instance: run `cleanup`, then `launch`.

## Drive

| Command | What it does |
|---|---|
| `$S check` | `tsc --noEmit` and `node --test test/*.test.ts` on the snapshot (or on `server/` if no run exists) |
| `$S demo-sim` | The repo's own end-to-end driver (`scripts/demo-sim.ts`): reset → sim intake → ORDERED → delivered → FIXED, plus 9 event assertions. Exit 0 means PASS |
| `$S reset` | `POST /demo/reset`, saves the new epoch (old-epoch webhooks are ignored) |
| `$S api METHOD PATH [json]` | Any route, with the `x-admin` header. E.g. `$S api POST /demo/sim-intake '{}'`, `$S api POST /jobs/job_1/stop '{}'`, `$S api POST /fault '{}'` |
| `$S wait-state STATE [secs]` | Polls `/jobs` until the newest job reaches STATE. Fails fast on STOPPED, ESCALATED, or DECLINED |
| `$S wait-event 'JQ' [secs]` | Polls `/events.json` until an event matches, e.g. `'.type=="guard" and .data.kind=="budget"'` |
| `$S probe-install STEP` | Sends one Vapi-shaped `install_progress` tool call for the newest job, the way the delivery-call agent would, and prints the server's spoken reply |

The feature recipes in [features/](features/README.md) say which commands prove which behavior. Start at the README.

## Evidence

- `$S capture <feature-id>` writes the following to `.verify-artifacts/<RUN_ID>/` (gitignored):
  - `<id>.events.json`: the full stream
  - `<id>.timeline.tsv`: one line per event, with a SIM marker
  - `<id>.jobs.json`: masked jobs
  - `<id>.events.jsonl`: the server's own on-disk event log. The internal `jobs.json` is never copied, because it holds unmasked numbers
- `demo-sim.txt`, `typecheck.txt`, `test.txt`, `server.log`, `build.txt`, and `source-manifest.txt` land in the same directory.

Proof standards:
- **Real path only.** Use admin routes and Vapi-shaped webhooks into `/vapi/webhook`, which is the production boundary. Never import orchestrator or jobs from a script, and never edit state files.
- **Action plus resulting state.** Quote the event(s) your action caused, with ids, plus the job state from `/jobs`, not just "it passed".
- **Side effects.** For a guard, show the guard event *and* its absence downstream: a rejected quote never becomes `best_deal`, a stopped job places no further `call_started`.
- **Phones are masked.** Event and job payloads must show `···NNNN`, never a full number. If you see a full number, that's a bug, so report it.
- A sim pass proves the engine, not Vapi. Never report "live works" from a sim run.

## Cleanup

```bash
$S cleanup
```

Kills only this run's process group (`kill -- -<pgid>`, never by name) and deletes `/tmp/fixie-verify/<RUN_ID>`. It keeps `.verify-artifacts/<RUN_ID>/` and lists it. Run cleanup after every failed iteration too.

## Gotchas

- **Other sessions kill servers by name.** Before the rename, a verify instance launched as `tsx src/index.ts` died silently mid-run, with no error in the log, because another session's `pkill`-style cleanup matched it. The helper now runs as `node src/fixie-verify-main.ts`. If the server still vanishes, `doctor` shows ❌ on the pid. Relaunch, and tell the user something is killing node processes.
- `SIM_SPEED=4` makes the whole dryer journey take about 15 s. At `SIM_SPEED=1` it's about 60 s, so raise `wait-state` timeouts.
- The `metrics.minutes` value is a live reservation figure. It rises and falls as calls reserve and release minutes (e.g. 8.63 → 0.94), so don't assert that it's monotonic.
- `/simulate/delivered` without `jobId` picks the newest ORDERED job. It returns 404 `no ORDERED job` otherwise.
