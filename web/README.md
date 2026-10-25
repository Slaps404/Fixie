# Fixie: operator audit view (judge board)

A static `index.html` with no build step, plus `serve.mjs`, a zero-dependency static server and admin proxy.

```bash
node web/serve.mjs                    # → http://127.0.0.1:8080/
#   /                 live: SSE from http://localhost:3000/events (→ /events.json polling → mock if the server is down)
#   /?replay=1        replay server/data/events.jsonl (last run), falling back to sample-real-sim-run.jsonl
#   /?replay=sample-real-sim-run.jsonl&run=1   a specific file/run (runs are split where the event id resets)
#   /?mock=1          mock-events.json (run 1 of the real sim log: full dryer job + port fault + kill switch)
```
You can also drag any `events.jsonl` onto the board to replay its last run.

## Hidden hotkeys (live)
| Key | Action |
|---|---|
| `I` | `POST /demo/sim-intake` (simulated Dorothy intake call) |
| `D` | `POST /simulate/delivered` (newest ORDERED job). In replay/mock: resume past the delivery pause |
| `P` | `POST /fault` (port tractor YT-07, SPN 3226 FMI 4) |
| `X` | Kill switch: `POST /jobs/:id/stop` (asks to confirm) |
| `R` · `Space` · `L` · `M` · `T` · `F` | clear board / restart replay · pause playback · live · mock · light/dark · fullscreen |

**Admin token:** the hotkeys `POST /admin/<path>` to `serve.mjs`, which adds `x-admin` from the root `.env` (`ADMIN_TOKEN`, re-read on every request) and forwards to the server. The token never reaches the browser or the terminal. The proxy only forwards to localhost and only allows the routes above.

**Options:** `serve.mjs` takes env `PORT` (8080), `HOST` (127.0.0.1), and `FIXIE_SERVER` (http://localhost:3000). The board takes query params `server=`, `speed=`, `manual` (playback waits for `D`), `loop`, `run=`, `theme=light`, plus fallback caps `maxCalls`, `maxMinutes`, `spendCap`, `budget=40`, `techBudget=1500`. Live `metrics` events override the calls, minutes, and spend caps.

## Round 3 (issues #11, #12)
- **Live diagnosis card:** `diagnosis_update{test, reading, posterior, top, topProb, next, reason}` draws one bar per hypothesis, in stable order, with the previous value as a tick mark. Below the bars: `reason`, the tests done, the next test, and "expert-written likelihoods". The card collapses to one line once sourcing starts; click it to toggle. A reading of `unknown`/`ambiguous` shows a warning. Pre-job updates (`jobId: null`) stay with the intake call and move to the job on `consent`/`diagnosis`.
- **Proof strip (always visible):** sourcing calls N/8 · minutes · parallel vs serial (`metrics.parallelMinutes`/`serialMinutes`, otherwise computed from call spans) · $ committed / cap · guards fired (+ `voicemailsSkipped`) · Fixie's own spend.
- **Decision log:** one row per `quote`/`best_deal`/`guard`/`order_confirmed`/`order_declined`/`job_state`: proposal → ✅/⛔ → approver (`approvedBy`: CODE · 🗣 DOROTHY · CAREGIVER, inferred if missing) → `reason`. A rejected quote's guard+quote pair is shown as a single row.
- **Recall/Camera fact rows** appear on `recall_check` / `vision_*`. The field names are guessed (`recalled|hit|found`, `vision_extract.model|text|summary`); adjust when the events land.
- **`mock-events.json`** = run 1 of the real sim log, plus 4 `diagnosis_update` events computed by Bayes from `server/data/faults/dryer_no_heat.json` (breaker ok → drum yes → no warmth → fuse open: 0.45 → 0.98). These are synthetic until the server emits them.

## What maps to what (spec v0.2)
- **Header:** OPERATOR AUDIT VIEW · `job_state` pill · SIMULATED pill ("ALL SIMULATED", or "SOME LEGS SIMULATED" when live and sim legs mix; per-row badges show only in mixed jobs) · job tabs.
- **Ticker:** the latest `guard.reason`, big, and it flashes on arrival.
- **Call lanes:** `call_started` / `transcript` / `call_ended`, with masked phones and a SIMULATED badge per lane. Intake transcripts with `jobId: null` wait until `consent`/`diagnosis` claims their `callId`.
- **Counters:** `metrics.savedVsTech` / `savedVsNextBest` (falling back to `best_deal`).
- **Meters:**
  - `metrics.guardedCalls`/`maxCalls` (plus the total `calls`)
  - `minutes`/`maxMinutes`
  - the order's landed total vs the $40 budget ($1500 for enterprise jobs)
  - `agentCostUsd`/`spendCap`
- **Quotes:** ranked by `landedTotal`. Rejected quotes (`rejected`/`rejectedReason`) are struck through and tagged OVER BUDGET or NOT IDENTICAL, with their `reason`.
- **Checkmarks:** `consent{callback}` and `safety_ack{unplugged, vent_cleared}`. Install steps show `skipped`.
- **SSE:** named `fixie` events and `reset` (clears the board). Reconnects use a fresh EventSource, so a restarted server's history replays; duplicates are dropped by `id|ts`.

Tested against `sample-real-sim-run.jsonl` (all 3 runs) and a live `DRY_RUN=1 SIM_SPEED=2` server (I → ORDERED → D → FIXED → `/demo/reset` clears), with no console errors, at 1920×1080 and 1366×768.
