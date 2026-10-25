# VERIFY: trust the system before the live demo

Two commands, run from `server/`. The first proves the logic with no phones. The second proves the phones, Vapi and the tunnel.

| Command | Needs | Proves | Exit |
|---|---|---|---|
| `npm run verify` | nothing (offline, sim lanes) | typecheck, unit tests, 11 scenarios through the real HTTP + `/vapi/webhook` path | 0 pass, 1 any failure |
| `npm run verify:live` | `VAPI_API_KEY`, running live server, tunnel | preflight, real calls, real webhooks | 0 pass, 1 failure, 2 not configured |

## 1. `npm run verify` (about 60 s)

Runs `tsc --noEmit`, `npm test`, then starts its own child server and kills it at the end (also on failure and Ctrl-C).

Child server: `DRY_RUN=1`, `SIM_SPEED=8`, port 3917 (or a free one), temp `JOBS_FILE` and `ROSTER_FILE`, `ADMIN_TOKEN=verify-admin-token`, `VAPI_WEBHOOK_SECRET=verify-webhook-secret`, `CAP_STUCK_SECONDS=3`. Caps are pinned, so your `.env` cannot change the result. `data/events.jsonl` has no env override, so the harness backs it up and restores it.

Each scenario rewrites the temp roster (from `data/roster.example.json`), calls `POST /demo/reset`, and drives the server over HTTP only.

| Scenario | Roster change | Must see |
|---|---|---|
| happy path | none | FIXED; guards `budget` and `no_answer`; best_deal PartsDirect at 13.05; order_confirmed `confirmedBy: voice`; minutes ledger settles to actual use |
| covered warranty | warranty `simPersona: covered` | best_deal $0 from warranty; the only order is the warranty one, no supplier purchase |
| all over budget | every supplier quotes over $40 | ESCALATED; 3 budget guards; no callback call; no order |
| stuck supplier | valley and coast `hold` (never quote) | guard `stuck` for each; each call gets `call_ended`; job still reaches a deal |
| declined order | user `simPersona: decline` | DECLINED; `order_declined`; no order; delivery refused |
| kill switch | valley, coast `hold` | `/jobs/:id/stop` mid-call: STOPPED; every `call_started` has a `call_ended`; no callback, no new calls |
| safety keyword | none | "burning smell" gives `safety pro_required`, ESCALATED, no `install_step`, no calls |
| install gate | suppliers `hold` | raw Vapi `install_progress` step 7 before the acks: tool result names what is missing, no `install_step`; opens only after both acks |
| fault | none | `POST /fault` reaches NOTIFIED; fault, diagnosis and calls flagged simulated |
| security | none | webhook without or with a wrong `X-Vapi-Secret` gives 401; 7 admin routes without `x-admin` give 401; `/jobs`, `/jobs/:id`, `/events.json` carry no 10+ digit numbers |
| SSE | none | `GET /events` delivers a `job_state` event during a scenario |

Personas (roster `simPersona`): suppliers `quote:<price>:<ship>:<in_stock|out_of_stock>:<eta>`, `no_answer`, `hold`; warranty `out_of_warranty`, `covered`, `no_answer`; user `decline`.

If a scenario fails the report lists each failed check. `VERIFY_KEEP=1` keeps the temp dir. `VERIFY_PORT=4000` changes the port.

## 2. `npm run verify:live`

Setup: the root `.env` has `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_INTAKE_ASSISTANT_ID`, `PUBLIC_URL`, `VAPI_WEBHOOK_SECRET`. The server runs live in another terminal (`npm start`, no `DRY_RUN`) and `ADMIN_TOKEN` matches. Without `VAPI_API_KEY` it prints what is missing and exits 2.

```
npm run verify:live                           # preflight only
npm run verify:live -- --phone partsdirect    # ring ONE roster phone (any roster id)
npm run verify:live -- --intake               # test the inbound line
npm run verify:live -- --intake --stop        # ...and stop the job after diagnosis
flags: --skip-preflight  --timeout <sec>  BASE=http://host:port
```

**`--phone <rosterId>`** calls `POST /demo/test-call {rosterId}` (admin). It creates a throwaway job (left in DIAGNOSED, so ending the call never triggers sourcing to other phones) and places one call through `dialer.placeGuardedCall`: supplier lane for suppliers, warranty, tech, or the user callback (mock order only). Then it asserts with timeouts: `call_started`, then answered (a transcript event, or Vapi status `in-progress`), then the result event (`quote` for suppliers, `warranty` for the warranty line), then `call_ended`, printing `endedReason`. Play the part on the phone: give a price, shipping and the part number.

It then prints the facts we had not verified against live Vapi: `call.cost` present, `call.name` stored (it cannot see whether the webhook echoes it; check the server log for `[webhook] unknown call`), `monitor.controlUrl` present (kill switch path), whether cost reached the server (`job.agentCostUsd`), end-of-call webhook latency, and dial-to-first-transcript time. Anything marked NO is a known risk, not a failure.

**`--intake`** prints "Call <TWILIO NUMBER> now from Dorothy's phone" and waits for `consent`, `diagnosis` and `part_identified`. It also checks the caller ID matches the roster user. Warning: when the intake call ends, real sourcing calls start. Use `--stop` or press the kill switch if you only want the intake leg.

## 3. Physical phone checklist (tick every box)

- [ ] Each roster phone rings: dorothy, whirlpool, valley, partsdirect, coast, tech. Run `--phone <id>` for each, from the stage spot, on that phone's own carrier. Bring a hotspot; use Wi-Fi calling if the room has no signal.
- [ ] The Twilio number is saved as the contact "Fixie" on every roster phone.
- [ ] Silence Unknown Callers is OFF, call screening is OFF, Focus/DND is off or allow-lists "Fixie" with emergency bypass, ringer at max.
- [ ] Audio is audible in the room: speaker puck for Dorothy, one front-row actor on speaker. Check from the back row.
- [ ] The tunnel is up: `curl $PUBLIC_URL/health` returns ok. A warm spare tunnel and a hotspot are ready. After any tunnel restart, restart the server (it re-syncs the intake assistant URL at boot) and re-run preflight.
- [ ] `npm run preflight` is all ✅ (also run by `verify:live`).
- [ ] `npm run verify` is all ✅ on the exact code and roster you will demo.
- [ ] Roster is final (`server/data/roster.json`, real E.164 numbers, no `simPersona` needed live).
- [ ] `POST /demo/reset` runs clean. Then one full rehearsal in the room at 4:30.

## 4. The 4:00 PM phone test procedure

1. `npm start` live (no `DRY_RUN`). `npm run verify:live` shows preflight all ✅.
2. In order, `npm run verify:live -- --phone <id>` for `partsdirect`, `valley`, `coast`, `whirlpool`, `tech`, then `dorothy`. Each must show ✅ through `call_ended`. Note the carrier and any failure.
3. `npm run verify:live -- --intake --stop` from Dorothy's phone. Confirm the opening line is audible within 8 s and the diagnosis appears.
4. Read the "Unverified Vapi facts" block. Fix or note every NO: no cost means the spend guard is blind; no `controlUrl` means the kill switch uses the unverified `DELETE /call/:id`, so press it once on a live call and confirm the phone hangs up.
5. Run the kill switch once on a real call: `curl -XPOST -H "x-admin: $ADMIN_TOKEN" $BASE/jobs/<id>/stop`.
6. `POST /demo/reset`.
7. Record the go/no-go level (section 5) and tell the operator.

## 5. Go/no-go per fallback level

The operator calls the level, no debate. Lane flips: `curl -XPOST -H "x-admin: $ADMIN_TOKEN" -H 'content-type: application/json' -d '{"lane":"supplier","mode":"sim"}' $BASE/demo/mode` (`lane` may be `all`). Events from sim lanes carry the SIMULATED badge.

| Level | GO when (verified by test) | Trigger on stage | Action |
|---|---|---|---|
| L0 all live | preflight all ✅; `--phone` ✅ for every roster id; `--intake` ✅; `verify` all ✅; kill switch hung up a real call | none | run as planned |
| L1 one lane sim | at least intake, callback and delivery are ✅ live; the failing lane is the only one | a call has no ring or answer 10 s after `call_started` | flip that lane to sim, never retry |
| L2 suppliers sim | intake, callback, delivery live ✅; suppliers failed `--phone` or flaky | two legs fail, or any Vapi 4xx/5xx | `lane supplier` to sim (or `MODE_SUPPLIER=sim`); the rest stays live |
| L3 all sim | `npm run verify` ✅ (the sim path is proven), board works | intake silent 8 s after connect, or tunnel down | hang up and redial once; if it fails again, `lane all` to sim with the badge |
| L4 video | backup video recorded at 5:30 plays; `events.jsonl` replay works | L3 also fails, or no board | play the video, narrate live, show real call logs from rehearsal |

NO-GO for L0 (drop to the level that passed): any roster phone failing `--phone`, intake not reaching `diagnosis`, caller ID mismatch, preflight red, tunnel flapping, or `verify` red. Never go on stage at a level you did not pass at 4:00.
