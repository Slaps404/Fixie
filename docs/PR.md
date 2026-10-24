# Fixie: one phone number for anything physical that breaks (c0mpiled-16 build)

## TL;DR
Fixie is an **AI voice support line for any physical hardware problem**.
1. Dorothy, 74, calls one number from any phone. Her dryer runs but won't heat.
2. Fixie diagnoses it by voice and identifies the exact part (thermal fuse **WP3392519**). It flags the real root cause (a clogged vent, which is a fire risk) and gates on safety.
3. It **places real phone calls in parallel** to the manufacturer warranty line and to parts suppliers. Quotes are captured **during** those calls by tool calls.
4. Guardrails enforced in code reject an over-budget quote and skip a supplier who declines the call.
5. Fixie **calls Dorothy back** with the cheapest identical part: "$13.05 landed, versus a $200 tech visit." It orders only when she says **"order it"**.
6. When the package is "delivered", Fixie **calls her again** and walks her through the 15-minute install by voice. Server-side safety gates require "unplugged" and "vent cleared" first. Then it confirms the fix: "It's warm!"

Dorothy never touches a screen. The same engine serves enterprise maintenance: a port terminal tractor's J1939 fault code starts sourcing before the ship docks (sim-only beat).

**Tracks:** No App (zero screens for the user), Unsupervised (a multi-day agent with real, tripping guardrails and a kill switch), and Dispatch (port fault beat, if multi-track entry is allowed).

---

## Why this exists
- **The repair gap.** A tech visit for a dryer that won't heat costs about $150–250. The part costs about $10. Seniors and non-technical people pay the difference, get scammed, or throw the appliance away. Adults 60+ reported **$3.0B in fraud losses in 2025** (FTC). About **22% of US adults 65+ have no smartphone** (Pew).
- **Existing assistants answer; they don't finish the job.**
  - Meta glasses, ChatGPT, Gemini Live, and Grok can explain how to fix a dryer.
  - Google's AI can call local businesses from Search, which is the closest competitor.
  - None of them owns the whole job across days by voice, from any phone: diagnose → warranty claim → parallel distributor calls by part number → a spoken-yes order → a delivery-day install call → a fix check.
- **One engine, two markets.**
  - Consumers are the emotional wedge, but home-warranty companies and insurers pay per resolved case.
  - Ports, fleets, and base facilities are the enterprise expansion. Crane downtime runs an estimated $5k–50k+/hr, and the Army created an HVAC repair task force on Oct 15, 2026.

## What's in this PR
### Docs
| File | What |
|---|---|
| `docs/SPEC.md` | Technical spec v0.2, revised after the adversarial review. Each fix is tagged ⟨R#⟩ |
| `docs/review/*` | 5 Sonnet review lenses + synthesis (`SYNTHESIS.md`) + Vapi API fact-check with verified JSON (`vapi-api-facts.md`) |
| `docs/issues/00–10` | This PR split into issues/workstreams with acceptance criteria |
| `docs/KEYS.md` | 15-minute key setup guide (Vapi, Twilio, ElevenLabs, Anthropic) |
| `HANDOFF.md` | Two-person lane split, event contract, timeline |
| `research/` | Judges, market, legal/safety, parts supply chain, differentiation, enterprise verticals (13 reports) |
| `plan/fixie-plan.html` | Interactive plan demo (simulated call + judge board) |

### Server (`server/`, Node 22 + TypeScript + Express 5, run with tsx)
| Module | Responsibility |
|---|---|
| `src/contracts.ts` | **Frozen interfaces** (`CallEvent`, `CallCtx`, `VoiceProvider`, `Jobs`, `Guards`, `Dialer`, `Orchestrator`) so 4 agents could build in parallel |
| `src/types.ts` | Domain types: `Job`, `Quote` (with `landedTotal`), `FixieEvent` (with `simulated`) |
| `src/config.ts` | Caps from env, per-lane live/sim mode (switchable at runtime), demo epoch, admin token |
| `src/events.ts` | Event bus → SSE `/events` (Last-Event-ID replay) and `/events.json`, `events.jsonl` log, `maskPhone()` |
| `src/calls.ts` · `src/jobs.ts` | Call registry · job store with **synchronous CAS transitions** and atomic snapshots |
| `src/guards.ts` | Every guardrail, pure and unit-tested. `reserve()` is synchronous so parallel dials can't race past caps |
| `src/parts.ts` | Seeded catalog: fuzzy model lookup (Levenshtein ≤ 2), identical-part check against cross-refs, fault-code lookup |
| `src/dialer.ts` | **The only place calls are placed.** Resolves destinations from the roster or caller ID, never from LLM output. Reserves guards, picks the provider by lane mode |
| `src/orchestrator.ts` | The lifecycle: intake → sourcing → ranking → callback → order → delivery → install → fix. Plus fault jobs, kill switch, timers |
| `src/routes.ts` | Admin routes (`x-admin`): `/simulate/delivered`, `/fault`, `/jobs/:id/stop`, `/demo/reset`, `/demo/mode`, `/demo/sim-intake`. Public `/jobs` |
| `src/vapi/webhook.ts` | Normalizes raw Vapi webhooks → `CallEvent`. Secret check, context resolution chain, tool-call dedupe, always 200 |
| `src/vapi/assistants.ts` · `prompts.ts` | Per-lane transient assistants (server URL + secret on assistant **and** tools, final-only transcripts, no AMD) and spoken-style prompts with AI + recording disclosure |
| `src/vapi/client.ts` | Vapi REST: create call, end call (controlUrl), get call; retry policy |
| `src/vapi/sim.ts` | Simulator: POSTs **Vapi-shaped webhooks into the real pipeline**, labeled `simulated` |
| `src/boot.ts` · `scripts/setup-vapi.ts` · `scripts/preflight.ts` | Keep the intake assistant's URL in sync with `PUBLIC_URL`; one-shot setup; a ✅/❌ go/no-go checklist |
| `scripts/demo-sim.ts` | End-to-end driver: reset → sim intake → ORDERED → delivered → FIXED, asserting that every required event fired |

### Web (`web/`, Lane B)
The OPERATOR AUDIT VIEW board for judges:
- call lanes with live transcripts
- the quote table with rejected rows struck through
- a guard ticker with deterministic reasons
- meters for calls, minutes, budget, and agent spend
- two savings counters
- a SIMULATED badge
- hidden hotkeys
- replay of a recorded run

## Architecture
```
Dorothy ─► Twilio # ─► Vapi "Fixie Intake" ──webhooks──► /vapi/webhook ─► CallEvent ─► orchestrator
                                                                               │
              guards.reserve() (sync) ◄─ dialer.placeGuardedCall() ◄───────────┘
                         │
                         └─► VoiceProvider: vapi/client (live) | vapi/sim (sim, same webhook path)
orchestrator ─► jobs (CAS) · calls · parts ─► events ─► SSE ─► web/ OPERATOR AUDIT VIEW
```

## Guardrails (Unsupervised track)
All guardrails are enforced in code, not prompts. Every one emits a `guard` event with a deterministic reason.

| Guard | Rule | Trips on stage? |
|---|---|---|
| budget | landed total ≤ $40 (consumer) / $1500 (tech) | **Yes:** Valley quotes $55 + $4 |
| no_answer / voicemail | skip, never retry | **Yes:** Coast declines |
| agent spend | Fixie's own Vapi cost ≤ $3 per job → stop + end calls | Meter visible |
| max_calls / minutes / loop | ≤ 8 sourcing calls, ≤ 20 min, ≤ 2 per vendor; synchronous reservation | Unit-tested |
| stuck | live call with no quote after 20 s → hang up | Unit-tested |
| vendor allow-list | only roster numbers or the caller's own number are ever dialed | Unit-tested |
| install safety | no "restore power" step until `unplugged` + `vent_cleared` are acked | **Yes:** delivery call |
| keywords | smoke / burning / gas → pro or 911 | Unit-tested |
| kill switch | `POST /jobs/:id/stop` ends live calls | Q&A demo |

## How the adversarial review changed the design
Six independent reviewers attacked spec v0.1: 5 Sonnet lenses and one Opus attacker. The blockers they found, and the fixes:
1. **Sourcing never started.** Tool-level server URLs never receive end-of-call reports. → The server URL is on every assistant. Sourcing starts on the first of: status ended, end-of-call report, or the `start_job` + 25 s fallback.
2. **The callback number came from the LLM.** → Use caller ID only (`call.customer.number`). Prices come from the server's ranked quote, never from tool args.
3. **Webhooks couldn't be matched to calls.** Top-level `metadata` isn't a field, and restarts wipe memory. → Context resolution chain (registry → `call.name` → `assistant.metadata` → inbound), a 3 s buffer, epochs, snapshots, `npm start` on stage.
4. **Guards were theater; none tripped in the demo.** → A real over-budget quote, a real declined call, an agent-spend meter, a kill switch that ends calls, and a synchronous `reserve()` chokepoint.
5. **Timers contradicted each other** (stuck 150 s > call max 180 s > callback 120 s). → All timers come from env with demo values. CAS transitions make the callback single-fire.
6. **Voicemail detection hangs up on real people.** → AMD off; `endedReason` is mapped instead.
7. **Post-call structured data is slow and deprecated.** → In-call `record_quote` / `record_warranty` tools put data on the board instantly.
8. **Tunnel URL drift.** → One long-running tunnel, plus `ensureInbound()` on boot and `preflight`.

Full table: `docs/review/SYNTHESIS.md` §1.

## Test plan
- [ ] `npm run typecheck`
- [ ] `npm test`: guards (caps, races, budget reason, install gates, keywords), parts (fuzzy lookup, identical-part), webhook normalization (Vapi fixtures)
- [ ] `SIM_SPEED=4 npm start` + `npm run demo:sim` → NEW→FIXED, with the `budget` and `no_answer` guard events asserted
- [ ] `npm run preflight` all ✅ (tunnel, auth, assistant URL, number attached, roster E.164)
- [ ] Live, lane by lane:
  - [ ] intake on a real phone
  - [ ] 1 supplier
  - [ ] all sourcing calls in parallel
  - [ ] callback with "order it"
  - [ ] delivery install call
- [ ] Prove the unverified Vapi behaviors on the first live call: webhooks for transient assistants, `call.name` echo, `cost` field, controlUrl end-call, account concurrency
- [ ] Rehearse ×3 in the MPR on the real phones. Backup video at 5:30. Keep that run's `events.jsonl` for replay.

## Demo (3:00) and fallback ladder
Run of show: `docs/SPEC.md` §8. Fallback levels:
- **L0:** all live.
- **L1:** a call doesn't connect → flip that lane to sim.
- **L2:** suppliers to sim.
- **L3:** all sim, with the SIMULATED badge.
- **L4:** backup video + replay of the recorded run.

## Risks and honest framing
- Suppliers are played by friends; prices come from real listings. We say so on stage.
- We say "compares quotes for the identical part", not "negotiates".
- The catalog is seeded; we don't claim a learned parts graph.
- Google's AI can call businesses; we never claim otherwise.
- Every call opens with "I'm an AI assistant; this call is recorded" (FCC 24-17, CA PC 632). There are no payments and no card details by voice.

## Issues
- [x] #0 Foundation
- [ ] #1 Engine core
- [ ] #2 Orchestrator
- [ ] #3 Vapi live
- [ ] #4 Simulator
- [ ] #5 Judge board (Lane B)
- [ ] #6 Phones, keys, pitch (Lane B)
- [ ] #7 Integration + live wiring
- [ ] #8 Caregiver call (stretch)
- [ ] #9 Volunteer supplier (stretch)
- [ ] #10 Port fault beat (stretch)

**Round 3: differentiation** (starts after the review/fix/verify round, with a green `/verify` baseline; re-verify after each)
- [ ] Open `/verify` findings:
  - port fault in sim (suppliers quote the dryer part; `max_calls` guard mislabeled)
  - install safety gate only covers step 7 (gate from step 1)
  - 5 of 7 install steps show "skipped" in sim
- [ ] #11 Bayesian multimeter diagnosis: `diagnosis.ts`, fault tree JSON, `record_test` tool, `diagnosis_update` event, sim script
- [ ] #12 Proof panel: `approvedBy` + deterministic `reason` on decision events, `metrics` (Lane A); decision log + strip (Lane B)
- [ ] #13 Quick wins, if time before the 5:30 freeze: 2nd quote round → caregiver co-sign → CPSC recall
- [ ] #14 Pitch reframe (Lane B): concede the calls, claim the closed loop + code-enforced guardrails

🤖 Generated with [Claude Code](https://claude.com/claude-code)
