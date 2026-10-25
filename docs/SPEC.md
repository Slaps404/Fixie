# Fixie: technical spec v0.2 (post adversarial review)

> One phone number for anything physical that breaks. Fixie diagnoses the problem by voice, claims the warranty or finds the cheapest identical part, orders it on your spoken "order it", and calls you when the box arrives to coach the install. The same engine handles enterprise maintenance (port equipment fault codes).

**Deadlines:** contracts frozen at 2:50 PM. Integration at 4:15. Feature freeze at 5:30. Submit by 6:20 internal, 6:30 hard.
**Reviews:** `docs/review/` holds 5 Sonnet lenses, a synthesis, and an Opus attack. Every blocker they raised is addressed below; each change is tagged ⟨R#⟩ with the hole number from `docs/review/SYNTHESIS.md` §1.

## 1. Goals (priority order) / non-goals
1. A real inbound call diagnoses a dryer with no heat and identifies WP3392519 by voice only.
2. Real outbound calls run **in parallel** (warranty plus suppliers). Quotes arrive **during** the call through the `record_quote` tool and are ranked on **landed total** ⟨R8, R17⟩.
3. A real callback to **the number that called in** (`call.customer.number`, never an LLM-heard number). It reads the order back, and the user confirms by saying "order it" ⟨R1, R18⟩.
4. A "delivered" carrier-webhook event triggers a real delivery call. The voice install walkthrough has **server-side safety gates** ⟨R14⟩.
5. **Guardrails that trip for real on stage** (Opus #1):
   - The $55 quote breaks the $40 budget.
   - A declined call counts as no_answer.
   - A live agent-spend meter with a cap.
   - A kill switch that ends the live calls.
6. **Per-lane live/sim mode.** The simulator posts Vapi-shaped webhooks into the same pipeline, and every event it produces is labeled `simulated`. It is the dev harness and the fallback ladder ⟨R13⟩.
7. Port fault (`POST /fault`), **sim-only and labeled**, after the cut line.

**Non-goals:**
- Real payments.
- Real carrier tracking.
- Calling real businesses live.
- Spanish.
- The `analysisPlan` field.
- A dynamic `assistant-request` webhook for inbound calls.
- A learned parts graph. We say "seeded catalog" on stage.

## 2. Architecture
```
Dorothy ─call─► Twilio # (paid, imported to Vapi) ─► Vapi "Fixie Intake" (persistent; server.url = PUBLIC_URL/vapi/webhook)
                                                        │ tool-calls / status-update / transcript(final) / end-of-call-report
                                                        ▼
 server/ (Node 22 + TS + Express :3000)  ── run with `npm start` on stage, never `dev` ⟨R6⟩
   vapi/webhook.ts  raw Vapi JSON ─► CallEvent (contracts.ts) ─► orchestrator.onCallEvent()
   orchestrator.ts  lifecycle ─► dialer.placeGuardedCall() ─► guards.reserve() (sync) ─► provider.createCall()
                                                           provider = vapi/client.ts (live) | vapi/sim.ts (sim) by lane mode
   jobs.ts (CAS transitions + snapshot)   calls.ts (call registry)   parts.ts (seeded catalog)   events.ts (SSE)
                                                        │ SSE /events
                                                        ▼
                                  web/index.html: OPERATOR AUDIT VIEW (judges only; Lane B)
 Tunnel: one long-running cloudflared quick tunnel. Server restarts don't change its URL. On boot, ensureInbound() PATCHes
 the intake assistant's server.url to PUBLIC_URL ⟨R6⟩. An ngrok static domain is preferred if someone makes an account.
```

## 3. Modules and owners (parallel workstreams; see `docs/issues/`)
| File | Owner | Notes |
|---|---|---|
| `types.ts`, `contracts.ts`, `config.ts`, `events.ts`, `index.ts` | Foundation (done) | **Frozen.** `maskPhone()` lives in events.ts: events never carry full numbers ⟨R22⟩ |
| `calls.ts`, `jobs.ts`, `guards.ts`, `parts.ts`, `test/guards.test.ts`, `test/parts.test.ts` | WS-1 Engine core | Pure logic plus stores |
| `dialer.ts`, `orchestrator.ts`, `routes.ts` | WS-2 Orchestrator | Lifecycle, ranking, timers, admin routes |
| `vapi/client.ts`, `vapi/assistants.ts`, `vapi/prompts.ts`, `vapi/webhook.ts`, `scripts/preflight.ts`, `scripts/setup-vapi.ts` | WS-3 Vapi live | Raw Vapi ↔ contracts |
| `vapi/sim.ts`, `fixtures/`, `scripts/demo-sim.ts` | WS-4 Simulator | Emits Vapi-shaped webhooks |

## 4. Lifecycle
```
NEW → DIAGNOSED → SOURCING → AWAITING_CONFIRMATION → ORDERED → DELIVERED → INSTALLING → FIXED
                                       └→ DECLINED       any → STOPPED (kill/guard) | ESCALATED (safety/stuck/2 failed callbacks)
enterprise: NEW → DIAGNOSED → SOURCING → NOTIFIED
```
All transitions use `jobs.transition(id, from, to)`, a synchronous compare-and-set, so exactly one path wins every race ⟨R4⟩.

**Intake (inbound, persistent assistant)**
- First message: *"Hi, I'm Fixie, an AI assistant. This call is recorded. Is it OK to continue, and OK to call you back on this number?"* ⟨R19⟩
- Prompt rule: accept every fact from the first answer, ask only for what's missing, and read the model back once, in chunks ⟨R7⟩.
- Tool `start_job({callerName, appliance, model, symptom, purchaseYear?, consentCallback})`. There is **no phone argument**.
  - Server side: an unknown inbound callId registers a `user`-lane context. `jobs.byCaller(fromNumber)` resumes an open job. Otherwise the server creates the job, runs `parts.lookup` (fuzzy, edit distance ≤ 2), and emits `consent`, `diagnosis`, `safety`, `part_identified`.
  - The tool returns a spoken string in under 1 s. The call is idempotent per callId ⟨R2, R12⟩.
- Keywords (smoke, burning, gas) → `pro_required`. Gas smell or smoke → "leave the house and call 911".
- If the intake call ends with no `start_job`, no job is created.

**Sourcing**
- Starts on the first of these, guarded by CAS `DIAGNOSED→SOURCING` ⟨R5⟩:
  - the intake call's `status=ended`
  - the intake `ended` report
  - `start_job` + `sourcingFallbackSeconds` (25)
- Calls go to the warranty line plus every roster supplier, staggered 300 ms apart.
- The warranty assistant calls `record_warranty({covered, detail})`.
- Supplier assistants call `record_quote({price, shipping, inStock, eta, partNumberSaid})`.
  - The server computes `identicalPart` with `parts.isIdentical`, plus `landedTotal`, then runs `guards.checkQuote`. An over-budget quote is kept with `rejectedReason` and emits `guard{budget, skipped, reason}`.
- Ranking: a covered warranty wins at $0. Otherwise the lowest `landedTotal` among quotes that are not rejected, have `identicalPart`, and are `inStock`.
- `endedReason` mapping: see §6. `no_answer`/`voicemail` → `guard{no_answer|voicemail, skipped}`, with **no retry**.

**Callback**
- Fires on the first of these, guarded by CAS `SOURCING→AWAITING_CONFIRMATION` ⟨R4⟩:
  - every sourcing call has ended
  - warranty plus 2 or more supplier calls have ended
  - `sourcingTimeoutSeconds` (60)
- Stragglers are hung up.
- The callback dials `job.customer.phone`, which came from the intake caller ID. It is skipped if `consentCallback === false`.
- Opening: *"Hi Dorothy, it's Fixie, the AI assistant you called at 7:46 about your dryer."* (Scam objection answered ⟨R18⟩.)
- It reads back the part, supplier, landed total, and ETA, then requires the words "order it".
- `record_order_decision({approved})` applies the **server's** best quote (never prices from the tool args) → ORDERED or DECLINED.
- No answer → one retry after 20 s, then ESCALATED. Fixie never asks for payment details by voice.

**Delivery**
- `POST /simulate/delivered` takes a carrier-webhook-shaped body and is fired by a hidden hotkey. CAS `ORDERED→DELIVERED` → delivery call.
- The assistant calls `safety_ack({kind:'unplugged'|'vent_cleared'})` and `install_progress({step})`.
  - `guards.canAdvanceInstall` rejects steps at or after "restore power" until both acks are in. The tool result tells the agent what is missing ⟨R14⟩.
  - Skipped steps emit `install_step{skipped:true}`.
- `report_fix({ok})` → FIXED, emitting `fix_verified`. Not ok → ESCALATED with an "install-only pro" note.

**Fault (enterprise, sim-only)**
- `POST /fault {asset, code, site}`. The tech number comes **only** from `roster.tech` ⟨R11⟩.
- `parts.byFault` → `safety{pro_required, "HV/exhaust work: certified tech only"}` → sourcing with the tech budget ($1500) → a `tech` lane call → NOTIFIED.

## 5. Guards (code, not prompts; all values from config)
| Guard | Rule | Event |
|---|---|---|
| reserve, one chokepoint ⟨R10⟩ | `dialer.placeGuardedCall` calls `guards.reserve()` **synchronously before any await**, so `Promise.all` cannot race past the caps | — |
| max_calls | ≤ 8 warranty/supplier calls per job. user/delivery/tech lanes are exempt but capped at 2 attempts each | `guard{max_calls, stopped}` |
| minutes | reserve `maxSec/60` per call and true it up on `settle`. Total ≤ 20 | `guard{minutes, stopped}` |
| maxSec | supplier 45 · warranty 45 · user 90 · delivery 480 · tech 60 (sent as `maxDurationSeconds`) | — |
| budget | `landedTotal` ≤ $40 consumer / $1500 tech | `guard{budget, skipped}` **(trips on stage: Valley $55 + $4)** |
| vendor_not_approved | the destination must be a roster entry or the job's own caller | `guard{vendor_not_approved, skipped}` |
| no_answer / voicemail | skip, no retry | **trips on stage: Coast declines** |
| loop | > 2 calls to the same vendor | `guard{loop, skipped}` |
| stuck | a live call with no `record_*` after `stuckSeconds` (20), or `endedReason=silence-timed-out` → end that call | `guard{stuck, skipped}` |
| agent spend | `job.agentCostUsd` (summed Vapi `cost`) ≤ $3. Over → stop the job and end its live calls | `metrics` meter + `guard{budget:"agent_spend", stopped}` |
| safety | `pro_required` → no install steps. Keywords → escalate | `safety` |
| kill switch | `POST /jobs/:id/stop` → STOPPED **and** `endCall` on every live call | `guard{manual, stopped}` |

Every `guard` event carries a deterministic, human-readable `reason` string, e.g. *"Valley quoted $59.00 landed. Over the $40 budget, skipped."*

## 6. Vapi integration (verified shapes in `docs/review/vapi-api-facts.md`)
- **Outbound:** `POST https://api.vapi.ai/call` with `{ name: "jobId|vendorId|lane", phoneNumberId, customer:{number}, assistant:{…} }`.
  - Put `metadata:{jobId,vendorId,lane}` in `assistant.metadata`. **No** top-level metadata ⟨R3⟩.
- **Every assistant** (persistent and transient) sets:
  - `server:{url, timeoutSeconds:20, headers:{'X-Vapi-Secret'}}`
  - `serverMessages:["tool-calls","status-update","end-of-call-report","transcript[transcriptType=\"final\"]","hang"]`
  - Each function tool also carries `server`.
  - `maxDurationSeconds` per lane, `silenceTimeoutSeconds: 15`, an `{type:"endCall"}` tool, and **no `voicemailDetection`**, because AMD hangs up on real people (Opus #7).
  - Models: `anthropic` with `FIXIE_MODEL` (Sonnet) for intake and the user lanes, and Haiku for warranty/supplier.
  - Voice: `11labs` if `VAPI_VOICE_ID` is set, otherwise the Vapi default.
- **Context resolution in the webhook**, in this order ⟨R3⟩:
  1. `calls.get(call.id)`
  2. parse `call.name`
  3. `call.assistant.metadata`
  4. `call.type==='inboundPhoneCall'` → new user-lane context

  Unknown ids are buffered for 3 s. Contexts from an older epoch are dropped.
- **Tool reply:** `{results:[{name, toolCallId, result:"<string>"}]}`. Always HTTP 200, in under 1 s. Handle every entry in `toolCallList`. Parse `arguments` whether it's an object or a JSON string. Cache by `toolCallId` ⟨R12⟩.
- Transcript fallback: `message.artifact.transcript`. Cost: `message.cost` (unverified; default to 0). Ended reason: `message.endedReason`.

| endedReason | reason |
|---|---|
| `voicemail` | voicemail |
| `customer-did-not-answer`, `customer-busy`, `twilio-failed-to-connect-call` | no_answer |
| `exceeded-max-duration`, `silence-timed-out` | timeout |
| `customer-ended-call`, `assistant-ended-call`, `assistant-said-end-call-phrase`, `*-ended-call` | completed |
| `pipeline-error-*`, other `twilio-*`, unknown | error |
| `call.start.error-subscription-concurrency-limit-reached` (on create) | retry once after 5 s |

- **Watchdog:** a call not live 40 s after creation → `GET /call/:id` and synthesize the end. Other 4xx: no retry. 5xx: one retry after 2 s.
- **Security:** the webhook checks `X-Vapi-Secret` when it's configured. `/demo/*`, `/simulate/*`, `/fault`, and `/jobs/:id/stop` require the `x-admin` header ⟨R11⟩.

## 7. Events
The contract lives in `HANDOFF.md`. Additions in v0.2:
- `id` doubles as the monotonic seq and the SSE id.
- Optional `simulated`.
- `reason` on `guard`, `quote`, and `best_deal`.
- `consent{callback}`, `safety_ack{kind}`, `metrics{elapsedSec, calls, minutes, agentCostUsd, savedVsTech, savedVsNextBest}`, `job_state{from,to}`, `error{where,detail}`.
- Phones are masked (`···0142`). `confidence` is labeled "lookup prior".

## 8. Run of show (hard 3:00) and fallback ladder
See `docs/review/SYNTHESIS.md` §3, adopted with these edits:
- The port beat is a 10-second sim with a badge.
- The guard moments are Valley's over-budget quote and Coast declining.
- The kill switch is shown only in Q&A.

**Fallback ladder (one operator calls it without debate):**
- **L0:** everything live.
- **L1:** a call doesn't ring or connect 10 s after `call_started` → `POST /demo/mode {lane, mode:"sim"}` for that lane.
- **L2:** two calls fail or Vapi errors → suppliers to sim; intake, callback, and delivery stay live.
- **L3:** the tunnel or intake is dead → all sim with the badge.
- **L4:** the backup video recorded at 5:30, plus `events.jsonl` replay on the board.

## 9. Ops
- `npm start` (never `dev`) on stage.
- On boot: `ensureInbound()` (an idempotent PATCH of the intake assistant), then a self-check of `PUBLIC_URL/health`.
- Jobs are snapshotted to `data/jobs.json` (tmp file + rename) on every transition and reloaded on boot.
- `npm run preflight` checks the tunnel, the assistant URL equals `PUBLIC_URL`, the number is attached, Vapi auth works, and every roster phone is in E.164.
- **Phones:**
  - Every role-play phone saves the Twilio number as the contact "Fixie", with Silence Unknown Callers and Focus off.
  - Test-call each phone at 4:00 in the MPR. Bring a hotspot.
  - Dorothy's audio goes through a speaker puck or headset into the PA, never a speakerphone near the crowd.
- Secrets live in the root `.env` (gitignored). `server/data/roster.json` (real phone numbers) is gitignored.
