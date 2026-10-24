# Live lanes

These are real phone calls through Vapi and a paid Twilio number: an inbound intake on Dorothy's phone, and outbound calls to the teammates who play the warranty line and the suppliers. They cost money and ring real people, so **every live run needs the user's explicit go-ahead, every time**.

## Sub-features

- `preflight`: tunnel, auth, assistant URL, attached number, E.164 roster → all ✅.
- `live-intake`, `live-supplier`, `live-parallel`, `live-callback`, `live-delivery`: one lane at a time, using `/demo/mode` to keep the rest in sim.
- `vapi-unknowns`: webhooks for transient assistants, the `call.name` echo, the `cost` field, controlUrl end-call, account concurrency (issue #7).

## How to get to it (user POV)

- Someone dials the Fixie number from a real phone, and teammates' phones ring.

## Driving it with fixie-verify

The helper deliberately can't do this. It strips keys. A live run uses the real `server/` with its `.env`, started by the user or with their approval:

- **Preflight.** Run `cd server && npm run preflight`. This is read-only against Vapi. Report each ✅ or ❌ line.
- Everything after that (`npm start` with keys, the live lanes) happens only after the user says go, in the order from `docs/issues/07-integration-live.md`. Capture `server/data/events.jsonl` as evidence.

## Gotchas

- Never report a live sub-feature as verified from a sim run.
- The real `server/data/roster.json` holds teammates' real numbers. Don't print it, and don't copy it into artifacts.
