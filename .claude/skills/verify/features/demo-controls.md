# Demo controls

These are the operator levers behind the fallback ladder: reset between rehearsals, flip individual lanes between live and sim, and replay the event stream to a reconnecting board.

## Sub-features

- `reset`: `POST /demo/reset` clears jobs and events and bumps the epoch, so stale webhooks are ignored.
- `lane-mode`: `POST /demo/mode {lane, mode}` (L1–L3 of the fallback ladder).
- `stream-replay`: SSE `/events` replays history, or everything after `Last-Event-ID`; `/events.json?since=N` is the polling fallback.

## How to get to it (user POV)

- The operator runs curl between rehearsals and during a live failure.
- The board reconnects after a network blip.

## Driving it with fixie-verify

Preconditions: a healthy run.

- **Reset.** Run a journey, then `$S reset`. The epoch increases by 1, `$S api GET /jobs` is `[]`, and `$S api GET /events.json` is `[]`.
- **Stale webhook ignored.** After a reset, a `probe-install` stamped with the old epoch must not change any job. Compare `$S api GET /jobs` before and after.
- **Lane mode.** Run `$S api POST /demo/mode '{"lane":"supplier","mode":"sim"}'`. The response has `modes.supplier:"sim"` and `dryRun:true`, and a `note` event says `Mode: supplier → sim`. In dryRun, `live` still resolves to sim. That's expected, and it's the safety property.
  - `$S api POST /demo/mode '{"lane":"bogus","mode":"sim"}'` → HTTP 400.
- **Replay.** Run `curl -sN -H 'Last-Event-ID: 5' http://127.0.0.1:3100/events | head -c 2000`. The first frame is `id: 6`.
- **Proof.** Run `$S capture demo-controls`.

## Gotchas

- Not yet driven. Expected values come from `server/src/routes.ts` and `events.ts`. Correct this file when you first run it.
- `/demo/mode` with `live` can't be verified while dryRun is on, by design. Live mode belongs to [live-lanes](./live-lanes.md).
