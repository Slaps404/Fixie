# #4 Simulator: Vapi-shaped webhooks for sim lanes + demo driver
**Owner:** build agent WS-4 · **Est:** 45 min

## Files you own
`server/src/vapi/sim.ts`, `server/fixtures/` (optional), `server/scripts/demo-sim.ts`

## Implement
- `sim.ts`: `export const simProvider: VoiceProvider & { simulateInbound(opts?): Promise<string> }`.
  - `createCall({to, name, spec, ctx})` returns `{callId: 'sim_'+n}` immediately, then asynchronously POSTs **Vapi-shaped raw payloads** (exact shapes from `docs/review/vapi-api-facts.md`) to `http://localhost:${config.port}/vapi/webhook`, with the `X-Vapi-Secret` header when it's configured.
    - Every payload has `message.call = {id, name, type:'outboundPhoneCall', customer:{number: to}, assistant:{metadata:{…ctx}}}`.
    - Timing is scaled by `config.simSpeed`.
  - Script per lane, using the roster's `simPersona` for supplier/warranty:
    - `quote:<price>:<shipping>:in_stock:<eta>`: ringing (1.5 s) → in-progress → 2–3 final transcripts → a `tool-calls` record_quote with `partNumberSaid:'WP3392519'` → end-of-call-report `customer-ended-call`.
    - `no_answer`: ringing → end-of-call-report `customer-did-not-answer` after 6 s.
    - `out_of_warranty`: record_warranty `{covered:false, detail:'Purchased 2019; 1-year parts warranty expired'}`.
    - `covered` → `{covered:true, …}`.
    - user lane (callback): transcripts, then record_order_decision `{approved:true}` after "Order it."
    - delivery lane: safety_ack unplugged, safety_ack vent_cleared, install_progress 4, install_progress 7, report_fix `{ok:true}`, with transcripts between ("It's warm!").
    - tech lane: a short acknowledgment.
    - Include `cost` (e.g. 0.04–0.12) in end-of-call reports.
    - **Read the tool reply `result`** and post it as the agent's next transcript line, so the board shows real server responses.
  - `endCall(ctx)`: cancel that call's pending timers and POST an end-of-call-report with `assistant-ended-call`.
  - `simulateInbound({from?, text?})`: simulates the intake call from `roster.user.phone` with `type:'inboundPhoneCall'`:
    - status in-progress → transcripts ("My dryer runs but the clothes come out cold. It's a Whirlpool, W-E-D-4-8-1-5-E-W, electric.")
    - → tool-calls start_job `{callerName:'Dorothy', appliance:'dryer', model:'WED4815EW', symptom:'runs but no heat', purchaseYear:2019, consentCallback:true}`
    - → the agent transcript speaks the result → status ended → end-of-call-report.
    - Returns the callId.
- `scripts/demo-sim.ts` (npm script `"demo:sim": "tsx scripts/demo-sim.ts"`; you may edit package.json **scripts only**). Against a running server (`BASE=http://localhost:3000`, `x-admin` from `.env`):
  1. `POST /demo/reset`
  2. `POST /demo/sim-intake`
  3. Poll `/jobs` until ORDERED (timeout 90 s at SIM_SPEED=4)
  4. `POST /simulate/delivered`
  5. Wait for FIXED
  6. Print an event timeline summary.

  Then assert the presence of: `diagnosis`, `warranty`, ≥ 2 `quote`, a `guard` with kind `budget`, a `guard` with kind `no_answer`, `best_deal`, `order_confirmed`, `install_step`, `fix_verified`. Exit 1 on a missing one.

## Don'ts
Don't import orchestrator/jobs (go through HTTP only, so sim exercises the real webhook path). Don't edit files outside your list.

**Acceptance:** typecheck passes. With #1–#3 merged and `SIM_SPEED=4 npm start`, `npm run demo:sim` passes.
