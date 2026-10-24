# Fixie SPEC v0.1: merged review (5 reviewers)

Reviewer keys: **VF** = vapi-api-facts, **TH** = technical-holes, **DS** = demo-stage-risk, **PS** = product-safety-judges, **SO** = standout-ideas.

I checked one claim against the repo: `server/package.json` runs `"dev": "tsx watch src/index.ts"`. That confirms TH-B3: saving any file wipes the in-memory map mid-demo. `server/src/vapi/` and `server/scripts/` are empty, so the contracts below land before any Vapi code exists.

## 1. HOLES

| # | Sev | Hole | Fix | By |
|---|---|---|---|---|
| 1 | blocker | `start_job.phone` is LLM-transcribed. A wrong digit dials a stranger, and anyone can say "my number is <victim>". | Drop `phone` from the args. The callback target is `message.call.customer.number`. If that is missing or anonymous and `DEMO=1`, use `roster.dorothy`. | VF TH DS PS SO |
| 2 | blocker | The inbound call is never in the `callId` map, so `start_job` and the intake report can't find a job. | If the call id is unknown and `call.type==="inboundPhoneCall"`, create the context `{lane:"user"}`. `start_job` is idempotent per callId. | VF TH |
| 3 | blocker | `metadata` is not a top-level `/call` field. Webhooks can arrive before `createCall` resolves. The map is lost on restart. | Resolve context in this order: id map, then `call.name` (`job|vendor|lane`), then `customer.number` against the roster. Buffer unknown ids for 3 s. Also put `assistant.metadata` on the call. Add `epoch` to the context so events from before a reset are dropped. | VF TH |
| 4 | blocker | Timers conflict. Callback is 120 s, stuck is 150 s, calls can run 180 s, so stuck can never fire. "No state change" is always true during SOURCING. Two paths can place the callback. | Read every timer from env with DEMO values. Use a synchronous CAS `transition()` so only the winner places the callback. Stuck is defined per call (§5). Drop any event that arrives for STOPPED or ESCALATED jobs. | TH DS PS SO |
| 5 | blocker | Sourcing waits on the intake `end-of-call-report`, which lags 5–15 s and can be missing or duplicated. | Start sourcing on the first of: intake `status-update: ended`, intake report, or `start_job` + 25 s. Guard it with a CAS. | TH DS |
| 6 | blocker | Quick-tunnel URL drift, plus `tsx watch` restarts. | Use an ngrok static domain or a named tunnel with `--protocol http2`. Run `ensureInbound()` PATCH on boot. Demo runs `npm start`. Add `preflight`. | TH DS VF |
| 7 | blocker | Intake runs 70–90 s against a 45 s slot. The 3:00 run has no visible stop. | Use a one-breath intake prompt. Use deterministic guard beats (§8). | DS PS SO |
| 8 | high | `analysisPlan` is deprecated, its field names conflict across docs, and its results are often empty. | Primary: in-call tools `record_quote` and `record_warranty`. Fallback: Claude on `message.artifact.transcript`. | VF TH SO |
| 9 | high | `endedReason` values are unmapped. `message.transcript` is the wrong path. | Use the mapping table in §6 and add `error` to the enum. | VF TH |
| 10 | high | `canPlaceCall` is a pure check, so `Promise.all` lets all three calls through. User callbacks get blocked by `max_calls`. | Add a synchronous `reserve()` inside the single `placeGuardedCall()` chokepoint. Lanes `user`, `delivery` and `tech` are exempt from `max_calls` and capped at 2 attempts each. | TH SO |
| 11 | high | Webhook and admin routes are open on a public tunnel. `/fault.techPhone` can dial any number. | Inline `server.headers.X-Vapi-Secret` and check it. Ignore `techPhone`. Require an `x-admin` token on `/fault`, `/demo/*`, `/simulate/*`. | VF TH |
| 12 | high | Tool replies are slow or malformed, which causes dead air. | Reply under 1 s. Always HTTP 200. `result` is a string, or use `error`. Handle the whole `toolCallList`. Cache by `toolCallId`. | VF TH |
| 13 | high | `DRY_RUN` is global and bypasses the webhook path. It has no clips and no labels. | Per-lane `live|sim` mode, switchable at runtime. The sim POSTs Vapi-shaped payloads to `/vapi/webhook`. Sim events carry `simulated:true` and the board shows an amber badge. | TH DS |
| 14 | high | The safety gate is prompt-only. A blown fuse means a clogged vent, which is a fire risk. Skipping to step 5 jumps past "unplug". | Server-side gates: `unplugged` and `vent_cleared` before "restore power". Emit `safety_ack` events. Add a hard-stop on keywords (smoke, burning, gas). | PS DS |
| 15 | high | The audience can't hear the calls, and phones get screened or labelled spam. | Use a hardware-AEC speaker puck for Dorothy and one front-row actor on speaker. Every actor saves the number as a contact with screening off. Test call each phone at 4:00. | DS |
| 16 | high | Delivery call is capped at 180 s. | `maxSec` per lane: supplier 45, user 90, delivery 480. Add a CAS on `ORDERED→DELIVERED`. | TH |
| 17 | high | Ranking ignores shipping. `identicalPart` is an LLM guess. | Add `shipping` and `landedTotal`, and rank and cap on `landedTotal`. `identicalPart` = the part number read back, normalized against `crossRefs`, computed in code. | PS TH |
| 18 | medium | Spoken "yes" is weak authority. Price comes from tool args. | Read back part, supplier, total and ETA. Require the phrase "order it". Take price and supplier from the server's ranked quote. Max 2 callback attempts, then ESCALATED. | PS TH |
| 19 | medium | Consent is a disclosure only (CA PC 632, TCPA). | One sentence: "AI assistant, recorded; OK to continue, and OK to call you back on this number?" Emit a `consent` event. Hang up on objection. | PS |
| 20 | medium | One $40 budget for every lane. Fixie's own spend is unmetered. | Caps: consumer 40, tech 1500. Add Vapi cost to a `metrics` event. | PS SO |
| 21 | medium | `since=ts` drops or duplicates events. Partial transcripts flood SSE. | Monotonic `seq` plus `Last-Event-ID`. Subscribe to `transcript[transcriptType="final"]`. | TH VF |
| 22 | medium | The "Simulate delivery" click reads as an app. "Money saved" mixes two numbers. Board shows PII. | Fire delivery from a hidden hotkey. Board header: "OPERATOR AUDIT VIEW". Two counters (vs tech visit, vs next-best quote). Mask phones to the last 4 digits. | DS PS |
| 23 | low | Submit time: 6:20 in SPEC, 6:30 in HANDOFF. | 6:20 internal, 6:30 hard. | TH DS PS |

**Where reviewers disagree, and what I chose:**
- **Stuck threshold.** DS says 15 s, SO 25 s, TH 60 s, PS 90 s. I chose env-driven, 20 s in DEMO and 90 s in production.
- **Sourcing trigger.** DS wants it on `start_job`, which rings the front-row phone while Dorothy is still talking. TH wants first-of. I chose TH's first-of, which uses `status-update: ended` and is near-instant.
- **Visible stop.** DS wants a hold-silent stuck leg, PS a $55 over-cap budget leg, SO a manual STOP. I chose budget, because it needs no extra actor and has no timer race. Stuck is shown via Vapi `silence-timed-out` only if a 4th actor exists.
- **Concurrency 4xx.** VF says retry. TH says never retry a 4xx. I chose: retry once after 5 s for concurrency errors only.
- **`twilio-failed-to-connect-call`.** VF maps it to `no_answer`, TH to `error`. I chose `no_answer`; every other `twilio-*` maps to `error`.
- **Dry-run scope.** TH wants per-job, DS per-lane. I chose per-lane, because the fallback ladder needs it.

**Unverified (prove with one real call by 3:30):**
- Metadata echo in webhooks.
- Precedence between tool, assistant and phoneNumber `server`.
- The `{type:"endCall"}` tool shape and `endCallFunctionEnabled`.
- `monitor.controlUrl` end-call.
- Concurrency limit for new accounts, and the rate limit.
- Model ids `claude-haiku-5-5` and `claude-sonnet-5`.
- `silenceTimeoutSeconds` minimum.
- The cost field name in the end-of-call report.
- `artifactPlan.recordingEnabled`.
- Whirlpool 1-year parts warranty.
- "~$2 per job" Vapi cost.

## 2. SPEC PATCH

**Header.** Replace with: `Deadline: feature freeze 5:30 PM, submit 6:20 PM internal (6:30 hard).`

**§1 Goal 7.** Replace with: "**Per-lane mode** (`MODE_<lane>=live|sim`, runtime `POST /demo/mode`). The simulator POSTs Vapi-shaped payloads from `fixtures/vapi/*.json` to `/vapi/webhook`. Every sim event carries `simulated:true`."

**§3 Modules.** Add these rows:
- `src/contracts.ts`: frozen at 3:05. Every module imports it unchanged.
- `src/dialer.ts`: `placeGuardedCall()` is the only importer of `VoiceProvider`. It resolves the destination from the roster or the inbound caller only.
- `src/vapi/tools.ts`: tool schemas and handlers in one place.

Change these rows:
- `webhook.ts` normalizes Vapi JSON into `CallEvent` and returns 200. The orchestrator never sees raw Vapi JSON.
- `extract.ts` is the fallback only.
- Routes other than `/vapi/webhook` and `/health` require `x-admin`.

```ts
// src/contracts.ts
import type { Lane, JobState, Job, Quote, GuardVerdict } from './types.js';
export type EndReason='completed'|'voicemail'|'no_answer'|'timeout'|'error';
export type Mode='live'|'sim';
export type ToolName='start_job'|'record_quote'|'record_warranty'|'record_order_decision'|'install_progress'|'report_fix';
export interface CallCtx{callId:string;jobId:string|null;lane:Lane;vendorId?:string;to:string;maxSec:number;mode:Mode;epoch:number;
  state:'reserved'|'ringing'|'live'|'ended';liveAt?:number;quoted:boolean;attempt:number}
export type CallEvent=
 |{kind:'tool';callId:string;toolCallId:string;name:ToolName;args:Record<string,unknown>;fromNumber?:string}
 |{kind:'status';callId:string;status:'ringing'|'live'|'ended'}
 |{kind:'transcript';callId:string;role:'agent'|'other';text:string}
 |{kind:'ended';callId:string;reason:EndReason;endedReason:string;durationSec:number;transcript?:string;costUsd?:number};
export interface CallRequest{jobId:string;lane:Lane;vendorId?:string;maxSec:number;assistant:object} // no `to`
export interface VoiceProvider{createCall(r:CallRequest&{to:string;name:string}):Promise<{callId:string}>}
export interface Guards{
  reserve(j:Job,r:{lane:Lane;vendorId?:string;maxSec:number}):GuardVerdict;      // sync, mutates
  settle(j:Job,callId:string,sec:number,costUsd?:number):void;
  checkStuck(j:Job,calls:CallCtx[],now:number):Array<{callId:string;v:GuardVerdict}>;
  checkQuote(j:Job,q:Quote):GuardVerdict|null;                                   // landedTotal vs lane cap
  canAdvanceInstall(j:Job,step:number):GuardVerdict|null;                         // unplugged, vent_cleared
}
export interface Jobs{get(id:string):Job|undefined;byCaller(num:string):Job|undefined;
  transition(id:string,from:JobState|JobState[],to:JobState):boolean /*sync CAS + snapshot*/}
export interface Dialer{placeGuardedCall(j:Job,r:CallRequest):Promise<CallCtx|null>}
export interface Orchestrator{onCallEvent(e:CallEvent):Promise<string|undefined>} // tool result; idempotent
// types.ts Quote += shipping:number; landedTotal:number; partNumberSaid?:string; source:'tool'|'claude'
```

**§4 Lifecycle.** Replace the bullets with:
- **Intake.** First message: "Hi, I'm Fixie, an AI assistant; this call is recorded. OK to continue, and OK to call you back on this number?"
  - Prompt rule: "Accept every fact in the first utterance; ask only for what's missing. Read the model back once in chunks."
  - Tool: `start_job({callerName, appliance, model, symptom, purchaseYear?, consentCallback:boolean})`.
  - The server takes the phone from the webhook, runs a fuzzy `parts.lookup` (edit distance ≤2), and replies within 1 s.
  - If the call ends with no `start_job`: emit `call_ended` and create no job.
  - A known caller with an open job resumes that job.
- **Sourcing.** Starts on the first of: intake `status-update: ended`, the intake report, or `start_job` + 25 s. Uses CAS `DIAGNOSED→SOURCING`.
  - Legs are staggered 300 ms apart.
  - Supplier tool: `record_quote({price, shipping, inStock, eta, partNumberSaid})`.
  - Warranty tool: `record_warranty({covered, detail})`.
  - Ranking: covered warranty wins. Otherwise lowest `landedTotal` where `identicalPart && inStock` and `checkQuote` passes.
- **Callback.** Fires on the first of:
  - every reserved call is terminal;
  - warranty plus ≥2 supplier legs are terminal;
  - `SOURCING_DEADLINE_S`.

  Uses CAS `SOURCING→AWAITING_CONFIRMATION`. Opening line: "You called Fixie at {time} about your dryer…". It reads back part, supplier, total and ETA, and requires "order it". `record_order_decision({approved})` applies the server's best quote. Max 2 attempts, then ESCALATED. Fixie never asks for payment details by voice.
- **Delivery.** Hidden hotkey calls `POST /simulate/delivered` (CAS `ORDERED→DELIVERED`). `install_progress({step})` is rejected past "restore power" until both `unplugged` and `vent_cleared` are acked. Skipped steps emit `install_step{skipped:true}`.
- **Fault.** `POST /fault {asset, code, site}`. The tech number comes from `roster.tech`. Emits `safety` "HV battery work refused". Tech cap is $1500. Terminal state is `NOTIFIED`.

**§5 Guards.** Replace the table with these rules (all values from env, DEMO value / production value):

| Guard | Rule |
|---|---|
| `max_calls` | ≤8 calls of lane `warranty` or `supplier`. Lanes `user`, `delivery`, `tech` are exempt, at ≤2 attempts each. |
| `minutes` | Reserve `maxSec/60` per call; `settle` trues it up. Total ≤20 min. |
| `maxSec` | supplier 45/90, user 90, delivery 480. |
| `budget` | `landedTotal` ≤ cap (consumer 40, tech 1500). An over-cap quote emits `guard{budget,skipped,reason}`. |
| `vendor_not_approved` | Destination must be a roster entry or the inbound caller. |
| `voicemail` / `no_answer` | Skip. No retry. |
| `loop` | Same vendor more than 2 times. |
| `stuck` | A live call with no `record_quote` after `STUCK_S` (20/90), or `endedReason=silence-timed-out`. Emits `guard{stuck,skipped}`. |
| `safety` | `pro_required` parts get no steps. Keywords smoke, burn or gas emit `pro_required` (911 for gas or smoke). |
| `consent` | No callback if `consentCallback=false`. |
| manual stop | `POST /jobs/:id/stop` sets STOPPED. |

Every `guard` event carries a `reason` string built deterministically in code.

**§6 Vapi.** Replace with the VF outbound JSON verbatim, with these changes:
- `serverMessages` includes `"transcript[transcriptType=\"final\"]"`.
- Haiku for outbound legs, Sonnet for intake.
- `silenceTimeoutSeconds: 15`.
- `endCall` tool, marked unverified.
- Same `server.url` and `X-Vapi-Secret` header on both the tool and the assistant.
- Reply shape: `{results:[{name,toolCallId,result:"<string>"}]}`.
- Parse `arguments` as either an object or a JSON string.
- Fallback transcript: `message.artifact.transcript`. Ended reason: `message.endedReason`.

`endedReason` mapping:

| endedReason | reason / action |
|---|---|
| `voicemail` | `voicemail` |
| `customer-did-not-answer`, `customer-busy`, `twilio-failed-to-connect-call` | `no_answer` |
| `exceeded-max-duration`, `silence-timed-out` | `timeout` |
| `*-ended-call`, `assistant-said-end-call-phrase` | `completed` |
| `pipeline-error-*`, other `twilio-*`, anything unknown | `error` |
| `call.start.error-subscription-concurrency-limit-reached` | retry once after 5 s |

Other rules:
- If a call is not `in-progress` 40 s after creation, `GET /call/:id` and synthesize the end.
- Other 4xx: no retry. 5xx: one retry after 2 s.

**§8.** Replace with §3 of this document.

**§9 Ops.**
- Run with `npm start`, never `dev`, during demo.
- Tunnel: `ngrok http --domain=<static> 3000`, or a named cloudflared tunnel with `--protocol http2`. Keep a warm spare.
- Boot runs `ensureInbound()` (PATCH the assistant, idempotent), then checks `fetch(PUBLIC_URL/health)` and exits on failure.
- Snapshot jobs on every transition with an atomic tmp-file-and-rename.
- `npm run preflight` checks: tunnel, assistant URL equals `PUBLIC_URL`, credit, number attached, concurrency, and a per-roster-phone pass line.

**HANDOFF contract.** Every event gets `seq` and optional `simulated`. Add `error` to `call_ended.reason`. Add `reason` to `guard`, `best_deal` and `quote`. New event types:
- `consent{callback}`
- `safety_ack{kind}`
- `metrics{elapsedSec, vapiCostUsd, savedVsTech, savedVsNextBest}`
- `job_state{from,to}`

Phones are masked to the last 4 digits. Drop `confidence`, or label it "lookup prior".

## 3. RUN OF SHOW (hard 3:00)

| t | Beat |
|---|---|
| 0:00–0:10 | Hook: "Dorothy, 74. Her dryer won't heat. She never sees a screen. Suppliers are played by friends; prices are real listings." Board header reads OPERATOR AUDIT VIEW. |
| 0:10–0:50 | Live intake on the speaker puck. Dorothy says everything in one breath; the agent does one chunked readback, then "I'll call you back." She hangs up and sourcing starts. |
| 0:50–1:30 | Four legs ring: warranty, PartsDirect (front row, audible), Valley, Hold. Warranty: "out of warranty" (~20 s). PartsDirect: "$9 plus $4 shipping", reads back the part number, and `record_quote` puts it on the board instantly. Valley quotes $55, which triggers `guard{budget,skipped}` in red with the ticker reason. If a 4th actor exists, the Hold leg goes silent and fires `guard{stuck}`. |
| 1:30–1:55 | Callback: "You called Fixie at 7:46… WP3392519, PartsDirect, $13 total, Tuesday. Say 'order it'." Dorothy: "Order it." Meters read: calls 4/8, minutes, $13/$40, Fixie cost. |
| 1:55–2:35 | Hidden hotkey fires "UPS webhook (simulated)" and the delivery call. Dorothy: "It's unplugged, vent's clear, panel's off, I'm holding the fuse." Two `safety_ack` events, then the agent jumps to replace, then "It's warm!" |
| 2:35–2:50 | `curl /fault`, labelled "simulated Samsara webhook". SPN 3226 decode, HV refusal logged, SIMULATED badge. "Dorothy is zero-screen; the tech is zero-hands." |
| 2:50–3:00 | Close on two counters, then who pays: home-warranty companies, insurers and senior living, per resolved case. |

**Fallback ladder.** One operator owns keys 1–4 and calls it without debate.
- **L0:** all legs live.
- **L1:** a leg has no ring or answer 10 s after `call_started`. Flip that lane to sim and never retry.
- **L2:** two legs fail, or any Vapi error. Set `MODE_supplier=sim`; intake, callback and delivery stay live.
- **L3:** intake is silent 8 s after connect, or the tunnel is down. Redial once, then go all-sim with the badge.
- **L4:** play the 5:30 backup video and show the real call logs from rehearsal.

## 4. STAND-OUT (top 4)

1. **Visible guard moment, meter strip and reason ticker** (SO2 + SO5 + PS4). 40 min: 15 in Lane A Slice 1 (`reason` strings, `metrics`), 25 in Lane B. This is the Unsupervised proof.
2. **Caller-ID continuity** (PS2 + SO3, light version). 30 min, Slice 2. `jobs.byCaller()` lets a re-dial resume the open job, and the callback opens with "You called Fixie at…". It answers the scam objection and needs no `assistant-request` rewiring.
3. **Caregiver closing call** (SO4). 25 min, after Slice 3. It only runs if the `consent` flag is set. It is a 25 s transient call, and the phone rings in the audience during the close.
4. **Unscripted supplier** (SO1, DS9). 20 min, Slice 1. The roster is read at call time. One actor goes off-script ("which part number again?"). A judge or volunteer is used only if their phone was enrolled and test-called by 5:00 (DS flags screening and "Scam Likely" risk).

**Do NOT build:**
- Spanish.
- A live real-business call (counters are closed at 7:45 PM; a pre-recorded clip is OK).
- The proactive fault-to-Dorothy call.
- `analysisPlan`.
- `assistant-request` dynamic inbound.
- `transferCall` (answer it in Q&A instead).
- The SVG parts graph.
- Rehydrate polling (snapshot only).
- A virtual card.
- The defense line.

## 5. QUESTIONS

1. **Who holds which phone, and how many actors will be in the room at 7:45?** Default: a friend plays Dorothy on Jianan's phone with the speaker puck. Three actors: warranty, PartsDirect in the front row, and Valley at $55. No Hold leg.
2. **What concurrency limit and credit does the Vapi dashboard show?** Default: assume 4 or more. If it is lower, run warranty first, then the suppliers.
3. **Can we enter multiple tracks?** Default: No App plus Unsupervised. Add Dispatch only if `/fault` runs in sim by 5:30.
4. **What do we build after the 5:10 cut line?** Default: the caregiver call (25 min) plus `/fault` in sim-only (15 min). No live tech call.
5. **Do we keep the warranty leg live?** Default: yes, renamed "warranty check", 20 s, with `purchaseYear`.
6. **Is caller ID visible from Dorothy's phone, and do actors' phones ring through?** Default: verify at the 4:00 test call. Use `roster.dorothy` only when `DEMO=1` and caller ID is missing.