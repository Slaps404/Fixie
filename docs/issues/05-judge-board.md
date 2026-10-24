# #5 Judge board: OPERATOR AUDIT VIEW (`web/`)
**Owner:** Lane B (friend + their Claude thread) · **Est:** 60–75 min · **Contract:** `HANDOFF.md` event table + SPEC v0.2 §7

## Must have
- A single static `web/index.html` with no build step. Header **"OPERATOR AUDIT VIEW: the caller never sees this"**.
- Connects to SSE `GET http://localhost:3000/events` (event name `fixie`; `reset` clears the board). Falls back to polling `/events.json?since=<id>`.
- **Call lanes:** one card per `callId`. Show the party, masked phone, lane, live/ended state, and the last 3 `transcript` lines. Ended cards show the reason.
- **Quote table:** supplier, price, shipping, **landed total**, in stock, identical part ✓/✗. Rejected rows are struck through in red with the `reason`. The winner is highlighted from `best_deal`.
- **Guard ticker:** every `guard` event shows big and red/amber with its `reason` string (e.g. "Valley quoted $59.00 landed. Over the $40 budget, skipped").
- **Meter strip** from `metrics`: calls n/8, minutes n/20, budget $n/$40, **Fixie spend $n/$3**.
- **Two counters:** "Saved vs tech visit" and "Saved vs next-best quote".
- An amber **SIMULATED** badge on any event with `simulated:true`.
- A job state pill from `job_state`.
- **Hidden hotkeys** with the `x-admin` header:
  - `D` → `POST /simulate/delivered`
  - `S` → `POST /jobs/:id/stop`
  - `R` → `POST /demo/reset`
  - `I` → `POST /demo/sim-intake`
- **Replay:** `?replay=events.jsonl` plays a recorded run with its original timing, with the banner "Recorded run, 5:04 PM".
- Readable from the back of the room: ≥ 20px body text, high contrast.

## Nice to have
- A parts mini-graph (model → part → supplier price edges). An install step progress bar (`install_step` n/of). The `safety_ack` checkmarks.

**Acceptance:** `?mock=1` plays `web/mock-events.json` through every section. Against the server, `npm run demo:sim` renders the full run with the budget + no-answer guards visible.
