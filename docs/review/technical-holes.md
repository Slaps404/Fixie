## Technical-holes review of `docs/SPEC.md` v0.1

### BLOCKERS

**B1. Job creation, sourcing trigger and callback number are fragile (§4).**
- Sourcing waits for the intake `end-of-call-report`. That report arrives several seconds after hangup, can be missing, or can be duplicated. If it never arrives, nothing is sourced and the board stays idle.
- `start_job({phone})` takes the number from LLM-transcribed speech, so a wrong digit means the callback dials a stranger.
- The inbound `callId` is not in the `callId→CallContext` map, because only `createCall` populates that map. Later tool calls and reports on the inbound call cannot find the job.
- A hangup before `start_job` leaves no job, and the spec says nothing about that case.
- Fix:
  - Take the phone from `message.call.customer.number` and ignore any `phone` argument.
  - Make `start_job` register `inboundCallId→jobId` and be idempotent per `callId`, since the LLM or a Vapi retry can call it twice and create two jobs.
  - Start sourcing on the first of {intake `status-update: ended`, intake `end-of-call-report`, 20 s after `start_job`}, guarded by a compare-and-swap (CAS) `NEW|DIAGNOSED→SOURCING`.
  - An intake call that ends with no `start_job` emits `call_ended` and creates no job.

**B2. Double callback and timer conflicts (§4, §5).**
- The callback fires on "all calls ended OR 120 s". Calls may run 180 s (`maxDurationSeconds`), and stuck fires at 150 s, so three timers disagree.
- A healthy 3-minute supplier call trips both the 120 s callback and the 150 s stuck guard.
- Stuck is defined as "no state change", but SOURCING never changes state while calls are live.
- The last `end-of-call-report` and a timer can both call `placeCallback`. Late quotes can arrive after STOPPED or after ranking.
- Fix:
  - `transition(id, from, to): boolean` is synchronous and runs before any `await`. Only the caller that wins the CAS places the callback.
  - Set `SOURCING_DEADLINE=170s` and the supplier `maxDurationSeconds=60` for the demo. Define stuck as `now - job.lastProgressAt > 60s` while a call is ringing or live.
  - `lastProgressAt` updates on any `call_started`, `transcript` or `call_ended` event.
  - Sourcing is complete when every reserved call is terminal, meaning ended and either extracted or extraction failed.
  - Drop any quote, tool call or decision that arrives for a job in STOPPED or ESCALATED.

**B3. Stale tunnel URL and restarts (§6, §9).**
- Quick-tunnel URLs change on every `cloudflared` restart. The persistent inbound assistant keeps the old `server.url`, so `start_job` silently 404s.
- `npm run dev` almost certainly uses `tsx watch`, which restarts on any file save and wipes memory mid-demo.
- Fix:
  - Use an ngrok free static domain, or a named cloudflared tunnel (`--protocol http2` for venue wifi). Either gives a stable `PUBLIC_URL`.
  - Run `ensureInbound()` (PATCH the assistant `server.url`) at every boot.
  - Boot check: `fetch(PUBLIC_URL/health)` must succeed or the server exits loudly.
  - The demo script is `tsx src/index.ts`, with no watch.
  - Snapshot jobs with an atomic write (tmp file plus rename) on every transition.
  - On boot, rehydrate jobs and call `GET api.vapi.ai/call/:id` for each non-terminal call, synthesizing the `ended` event.

**B4. `callId→CallContext` race and loss (§3, §6).**
- Vapi can post `status-update: ringing` before `createCall` resolves and the map is set. The map is also lost on restart.
- Fix:
  - Put `{jobId, lane, vendorId}` in the call's `assistant.metadata` (verify field placement with one real call).
  - The webhook derives context from the payload first and the map second.
  - Unknown `callId` or unknown `jobId` returns 200 and is ignored. This matters for `/demo/reset` during in-flight calls, so give reset an `epoch` and drop events from older epochs.

### HIGH

**H1. Tool-call handling (§6).**
- Vapi's tool timeout is about 20 s. Anything slower makes the agent go dead silent.
- Rules:
  - `start_job` must return in under 1 s: no Claude call and no `await` on sourcing.
  - Always return HTTP 200 with `{results:[{toolCallId,result}]}`, even on error (`result:"error: …"`).
  - Handle the whole `toolCallList` array.
  - Cache results by `toolCallId` so retries are idempotent.
  - Give every tool `messages:[{type:"request-start",content:"One moment."}]`.
  - Verify the webhook with a `server.secret` header check.

**H2. Guard enforcement has holes (§5).**
- `canPlaceCall` is a pure check. With `Promise.all` over 3 suppliers, all three pass before any counter increments.
- User callbacks, delivery calls and tech calls need to go through the guard too. Otherwise a job that hits `max_calls` cannot place its "call the user" escalation. The two rules deadlock, because the guard refuses the very call the stop path needs.
- Minutes are only known after the end report, so they cannot be enforced in flight.
- Fix:
  - `Guards.reserve()` is a synchronous mutating function called inside the single chokepoint `placeGuardedCall()`. It increments the call count and adds `maxSec/60` to reserved minutes. `settle()` trues this up on the end report.
  - `lane ∈ {user, delivery, tech-notify}` is exempt from `max_calls` and the roster check, with its own cap of 2 attempts per job.
  - Destinations come only from `roster[vendorId]` or the inbound caller number. Nothing from a request body or LLM argument.
  - `index.ts` must not allow any other path to `vapi.createCall`.

**H3. `/fault` and the other routes sit on a public tunnel (§2, §3).**
- `techPhone` in the `/fault` body lets anyone who finds the tunnel make Fixie dial an arbitrary number. `/demo/reset` and `/simulate/delivered` are also open.
- Fix:
  - Ignore `techPhone` and use `roster.tech`.
  - Require an `x-admin` token on `/fault`, `/demo/*` and `/simulate/*`.
  - Only `/vapi/webhook` (secret-checked) and `/health` are tunnel-safe. Bind the others to localhost.

**H4. Delivery call is capped at 180 s (§4, §5).**
- A 7-step walkthrough plus the fix check will not fit in 180 s, so the call is cut mid-install. The spec also counts it against the 20-minute budget.
- Fix:
  - Make `maxSec` per lane: delivery 480, callback 90, supplier 60.
  - Give `/simulate/delivered` a CAS on `ORDERED→DELIVERED`, so a double-clicked button does not place two calls.

**H5. DRY_RUN parity (§3, §8).**
- `client.ts` delegates to `simulator.ts`, so webhook parsing, `endedReason` mapping and tool-call shape are never exercised in dry-run. The first run of that code is live at 4 PM.
- Fix:
  - The simulator POSTs real Vapi-shaped payloads to its own `/vapi/webhook`.
  - Capture one real call's JSON into `fixtures/vapi/*.json` and replay it.
  - Add `POST /simulate/intake` to fire the `start_job` path.
  - Make dry-run per job (`mode: "live"|"dry"`, `POST /fault?dry=1`). A global `DRY_RUN` cannot show a live dryer next to a dry port job.
  - §8 promises "pre-recorded audio clips", but the simulator only produces transcripts. Fix one of the two.

**H6. `endedReason` and unanswered calls are unmapped (§5, §6).**
- The `call_ended` enum has only 4 values, and Vapi has many `endedReason` values. Unmapped values crash or hang.
- Fix:
  - Map `voicemail` to `voicemail`.
  - Map `customer-did-not-answer` and `customer-busy` to `no_answer`.
  - Map `exceeded-max-duration` and `silence-timed-out` to `timeout`.
  - Map `assistant-ended-call` and `customer-ended-call` to `completed`.
  - Map `pipeline-error-*` and `twilio-*` to `error`, and add `error` to the `HANDOFF.md` enum.
  - Add a per-call watchdog: if no `in-progress` status within 40 s of `createCall`, poll and synthesize `no_answer`.
  - Vapi 4xx (bad number, concurrency, credits): do not retry, count the call as failed, `guard{skipped}`. Vapi 5xx or network: one retry after 2 s.

**H7. Callback can be answered by the wrong party (§4).**
- Voicemail or a different person on the callback can produce a "yes". The spec has no retry policy for an unanswered callback.
- Fix:
  - Enable `voicemailDetection` on callback and delivery calls.
  - `record_order_decision` takes the price and supplier from the server's ranked quote, not from tool arguments.
  - Budget compares `price + shipping`. Add `shipping` and `total` to `Quote`.
  - Max 2 callback attempts, then ESCALATED plus a `guard` event.

### MEDIUM

- **Quote extraction latency.** `structuredData` arrives 5–30 s after hangup. Add a `report_quote({price,shipping,inStock,eta,identical})` tool on supplier calls, so the quote lands during the call. Keep the end-report extraction as the fallback.
- **Events.** `since=<ts>` loses or duplicates events in the same millisecond. Add a monotonic `seq` and support `Last-Event-ID` on SSE so the board can reconnect. Emit only final transcripts (`transcriptType=final`).
- **Tech lane.** It has no states or tools. Add `lookupByFault(code)` and a terminal state `NOTIFIED` for tech jobs.
- **Submit time.** `SPEC.md` says 6:20 and `HANDOFF.md` says 6:30. State 6:20 as the internal target.

### Parallel-implementation verdict
The split is **not safe as written**.
- `orchestrator.ts` is a monolith that depends on everything, so it is the critical path.
- Tool schemas live in `assistants.ts` but are handled in `webhook.ts`, and the extraction schema is duplicated across `extract.ts` and the assistants.
- `CallContext` is undefined.

Split into four agents:
- **A1:** `types.ts`, `jobs.ts`, `guards.ts`, `events.ts`. Pure, no IO.
- **A2:** `vapi/*` and `tools.ts`.
- **A3:** `simulator.ts`, `routes.ts`, `index.ts`, fixtures, e2e test.
- **A4:** `orchestrator.ts`, `extract.ts`, `parts.ts`.

A1 writes `types.ts` and `contracts.ts` first, in the next 15 minutes, and the others import them unchanged.

```ts
// contracts.ts (frozen first)
export type ToolName='start_job'|'report_quote'|'record_order_decision'|'install_progress'|'report_fix';
export type EndReason='completed'|'voicemail'|'no_answer'|'timeout'|'error';
export type CallEvent =
 |{kind:'tool';callId:string;toolCallId:string;name:ToolName;args:unknown;from?:string}
 |{kind:'status';callId:string;status:'ringing'|'live'}
 |{kind:'transcript';callId:string;role:'agent'|'other';text:string}
 |{kind:'ended';callId:string;reason:EndReason;durationSec:number;transcript?:string;structured?:unknown};
export interface CallRef{callId:string;jobId:string;lane:CallLane;vendorId?:string;reservedSec:number;state:'reserved'|'ringing'|'live'|'ended'}
export interface VoiceProvider{ createCall(r:{jobId:string;lane:CallLane;vendorId?:string;to:string;assistant:AssistantSpec;maxSec:number;mode:'live'|'dry'}):Promise<{callId:string}> }
export interface Guards{ reserve(j:Job,r:{lane:CallLane;vendorId?:string;maxSec:number}):GuardVerdict; settle(j:Job,callId:string,sec:number):void; stuck(j:Job,now:number):GuardVerdict|null }
export interface Jobs{ get(id:string):Job|undefined; transition(id:string,from:JobState|JobState[],to:JobState):boolean /*sync CAS*/ }
export interface Orchestrator{ onCallEvent(e:CallEvent):Promise<{toolResult?:string}> /*idempotent, order-independent*/ }
```

`webhook.ts` only normalizes Vapi JSON into `CallEvent` and returns the 200 response. The orchestrator never sees raw Vapi JSON.