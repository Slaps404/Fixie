# #2 Orchestrator: dialer, lifecycle, ranking, timers, admin routes
**Owner:** build agent WS-2 · **Depends on:** #1 contracts (code against the interfaces; the implementations land in parallel) · **Est:** 60 min

## Files you own
`server/src/dialer.ts`, `server/src/orchestrator.ts`, `server/src/routes.ts`

## Implement (SPEC §4–§5; contracts unchanged)
- `dialer.ts`: `export const dialer: Dialer`.
  - `placeGuardedCall(job, req)`: resolve `to` (supplier/warranty/tech from the roster by `vendorId`/lane; user/delivery → `job.customer.phone`). Then call `guards.reserve(job, {...req, to})` **before any await**. If it's not ok, emit `guard{kind, action, reason}` and return null.
  - Pick the provider by `modeFor(lane)`: `import { vapiProvider } from './vapi/client.ts'` or `import { simProvider } from './vapi/sim.ts'` (both export `VoiceProvider`).
  - `name` = `${job.id}|${vendorId ?? '-'}|${lane}`. Register a `CallCtx` in `calls` (state 'ringing', epoch = `getEpoch()`) and push a `CallRecord` onto the job. Emit `call_started{callId, lane, party, phone: maskPhone(to)}` with `simulated` when in sim mode.
  - On create error: if the message includes 'concurrency', retry once after 5 s. Otherwise emit `error{where:'createCall'}` and return null.
  - `endCall(callId)` delegates to the right provider.
- `orchestrator.ts`: `export const orchestrator: Orchestrator`. `onCallEvent` handles:
  - **tool `start_job`**:
    - Idempotent per callId: cache the result string.
    - Find or create the job via `jobs.byCaller(fromNumber)`, falling back to `roster.user.phone` when `fromNumber` is missing (demo only, and log a note).
    - Register an inbound ctx if absent.
    - Run `parts.lookup` and `guards.safetyKeywords(symptom)`.
    - Emit `consent`, `diagnosis{appliance, issue, confidence, label:'lookup prior'}`, `safety`, `part_identified`.
    - CAS NEW→DIAGNOSED. Schedule the sourcing fallback timer (`sourcingFallbackSeconds`).
    - Return a ≤ 2-sentence spoken string that includes the root-cause vent note, or the pro-required wording.
  - **status/ended for the intake call** (lane user, `job.intakeCallId`) → `startSourcing(job)`, guarded by CAS DIAGNOSED→SOURCING.
  - **startSourcing:** `placeGuardedCall` for the warranty lane and each roster supplier, staggered 300 ms. Start the `sourcingTimeoutSeconds` timer and a 5 s interval running `guards.checkStuck` (end stuck calls, emit `guard{stuck}`).
  - **tool `record_warranty`** → `job.warranty`, emit `warranty`, mark ctx quoted.
  - **tool `record_quote`** → build the `Quote`:
    - `landedTotal = price + (shipping ?? 0)`.
    - `identicalPart = parts.isIdentical(partNumberSaid, job.part)`.
    - Run `checkQuote`; set `rejectedReason` and emit `guard{budget, skipped, reason}` if rejected.
    - Emit `quote{…, reason}`. Return a short thank-you string.
  - **ended** (any call):
    - `calls.update` → ended. `guards.settle(job, ctx, durationSec, costUsd)`.
    - Emit `call_ended{callId, reason}`. no_answer/voicemail → `guard{no_answer|voicemail, skipped, reason}`.
    - `checkSpend` → if over the cap, `stopJob`.
    - Emit `metrics`. Then evaluate the callback trigger.
  - **Callback trigger** (first of: all sourcing calls ended; warranty + ≥ 2 suppliers ended; timeout):
    - CAS SOURCING→AWAITING_CONFIRMATION.
    - End the remaining live sourcing calls.
    - Rank: a covered warranty wins at $0; else the lowest `landedTotal` that is not rejected, identical, and inStock.
    - Emit `best_deal{supplier, landedTotal, techVisitCost, savedVsTech, savedVsNextBest, reason}`.
    - No deal → ESCALATED with a note.
    - If `consentCallback !== false`, `placeGuardedCall(job, {lane:'user'})`.
  - **tool `record_order_decision`** → uses the server's `bestDeal`, never prices from the args. CAS AWAITING_CONFIRMATION→ORDERED (emit `order_confirmed{…, confirmedBy:'voice'}`) or DECLINED (`order_declined`).
  - **Callback ended without a decision** → retry once after 20 s (`callbackAttempts`), then ESCALATED.
  - **onDelivered(jobId):** CAS ORDERED→DELIVERED, emit `delivered{carrier:'UPS', partNumber, simulatedWebhook:true}`, place the delivery-lane call, and set INSTALLING on the first `install_progress`.
  - **tool `safety_ack`** → push to `safetyAcks`, emit `safety_ack`.
  - **tool `install_progress{step}`** → `guards.canAdvanceInstall`. If blocked, return a string telling the agent what's missing. Otherwise emit `install_step{step, of, text, skipped?}` (skipped when step > previous + 1) and return the text of the **next** step.
  - **tool `report_fix{ok}`** → FIXED + `fix_verified`, or ESCALATED.
  - **transcript** → emit `transcript{callId, lane, speaker, text}`. If the text trips `safetyKeywords` on a user/delivery lane, emit `safety` and note it.
  - **Drop events** for contexts with an old epoch, or for jobs in STOPPED/ESCALATED (except `ended`).
  - **startFault(payload):**
    - Create an enterprise job with customer = `roster.tech`. Emit `fault`.
    - Run `parts.byFault` and emit `safety{pro_required}`.
    - CAS NEW→DIAGNOSED→SOURCING with suppliers. After the callback trigger, call the tech lane and CAS → NOTIFIED.
    - Every event for this job is marked simulated when `modeFor('tech')==='sim'`.
  - **stopJob:** CAS any non-terminal → STOPPED, `endCall` every live call, emit `guard{kind:'manual'|'budget', action:'stopped', reason}`.
  - **resetAll:** `bumpEpoch`, clear timers, `jobs.reset`, `calls.reset`, `resetEvents`.
- `routes.ts`: `export function register(app)`.
  - Admin routes (`x-admin` must equal `config.adminToken`; else 401):
    - `POST /simulate/delivered {jobId?}`: default to the latest ORDERED job; accept a carrier-shaped body.
    - `POST /fault`
    - `POST /jobs/:id/stop`
    - `POST /demo/reset`
    - `POST /demo/mode {lane, mode}`
    - `POST /demo/sim-intake`: tells `simProvider` to simulate an inbound intake call. Calls `simProvider.simulateInbound()`, which is exported by `vapi/sim.ts`.
  - Public: `GET /jobs`, `GET /jobs/:id` (with phones masked).
- Timers: keep a `Map<jobId, NodeJS.Timeout[]>` and clear it on terminal states and reset.

## Don'ts
Never put raw Vapi JSON in here (that's webhook.ts's job). Never take a phone number or a price from tool args. Don't edit files outside your list.

**Acceptance:** typecheck passes. With #1, #3, and #4 merged, `npm run demo:sim` drives a job NEW→FIXED, with the budget guard and no-answer guard events present.
