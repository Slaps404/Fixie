# Judge board

`web/index.html` is the OPERATOR AUDIT VIEW. It renders call lanes with live transcripts, the quote table (rejected rows struck through), the guard ticker, meters, savings counters, and a SIMULATED badge. It's static, with no build step. It's the teammate's lane (Lane B), so don't edit `web/` from a verification run.

## Sub-features

- `live-connect`: SSE to `?server=` → the status pill shows live.
- `lanes`: one lane per `call_started.callId`, with transcripts landing in it.
- `quotes`: the Valley row is struck through as over budget, PartsDirect wins.
- `guards`: the budget and no_answer reasons show in the ticker.
- `sim-badge`: SIMULATED is shown when events carry `simulated:true`.
- `mock`: `?mock=1` plays `web/mock-events.json` without a server.

## How to get to it (user POV)

- A judge watches the projector, which shows `http://localhost:8080/?server=<server>`.

## Driving it with fixie-verify

Preconditions: a healthy run on :3100, then `$S reset`.

- **Serve the board.** Run `python3 -m http.server 8081 -d web --bind 127.0.0.1` in the background (record its pid for cleanup).
- **Open it.** Use the T3 preview tools: `preview_open` on `http://127.0.0.1:8081/?server=http://127.0.0.1:3100`. The pill reads live, not `MOCK (server offline)`.
- **Run the journey.** Run `$S demo-sim` in another shell while the board is open.
- **Proof.** Take a `preview_snapshot` and a screenshot after `best_deal`, and again after `fix_verified`. They show the struck-through Valley row, the two guard reasons, the SIMULATED badge, and a delivery lane ending in "It's warm!". Save them in `.verify-artifacts/<RUN_ID>/board-*`.
- **Cleanup.** Kill the http.server by its recorded pid.

## Gotchas

- Not yet driven. Make sure the board's CORS needs (see `web/README.md`) are met by `cors()` in `server/src/index.ts`.
- The meter limits come from query params (`maxCalls`, `maxMinutes`, `budget`), not from the server. The README defaults `budget=50`, but the server cap is $40, so pass `budget=40`.
