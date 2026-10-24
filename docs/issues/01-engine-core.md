# #1 Engine core: calls registry, jobs store, guards, parts (+ tests)
**Owner:** build agent WS-1 · **Blocks:** #2 · **Est:** 40 min

## Files you own (create only these)
`server/src/calls.ts`, `server/src/jobs.ts`, `server/src/guards.ts`, `server/src/parts.ts`, `server/test/guards.test.ts`, `server/test/parts.test.ts`

## Implement (against `server/src/contracts.ts`, unchanged)
- `calls.ts`: `export const calls: CallRegistry`. In-memory Map. `live()` = state !== 'ended'.
- `jobs.ts`: `export const jobs: Jobs`.
  - Ids `job_1`, `job_2`, …
  - `create()` fills defaults: `state:'NEW'`, `quotes:[]`, `calls:[]`, `vendorCallCount:{}`, `laneAttempts:{}`, `guardedCalls:0`, `reservedMinutes:0`, `agentCostUsd:0`, `safetyAcks:[]`, `callbackAttempts:0`, `notes:[]`.
  - `transition()` is a **synchronous CAS**. On success it sets `updatedAt`, emits `job_state{from,to}`, and snapshots. On failure it returns false and changes nothing.
  - `byCaller()` normalizes digits and returns the newest job not in FIXED/DECLINED/STOPPED/ESCALATED/NOTIFIED.
  - Snapshot to `data/jobs.json` atomically (write tmp, then rename) on every transition/update. Load it on module init. Must not throw if the file is missing or corrupt.
- `guards.ts`: `export const guards: Guards`, implementing SPEC §5 exactly. Read caps from `config`.
  - `reserve()` mutates counters **synchronously** and returns a `GuardVerdict` with a deterministic human `detail` (used as `reason`).
  - Budget: consumer `config.caps.budget`, enterprise `config.techBudget`.
  - Exempt lanes `user`/`delivery`/`tech`: ≤ 2 attempts each, never counted in `max_calls`.
  - `vendor_not_approved`: `to` must equal a roster entry phone or `job.customer.phone`. Load the roster via `loadRoster()`, re-reading each call so edits apply live.
  - `canAdvanceInstall(job, step)`: steps are 1-based. Find the index of the step containing "plug in" or "restore power" (the last step for WP3392519). Steps ≥ that index require both `unplugged` and `vent_cleared` in `job.safetyAcks`.
  - `safetyKeywords`: /smok|burn|gas smell|smell gas|spark|fire/i → `{ok:false, kind:'safety', action:'escalated'}`.
- `parts.ts`: `export const parts: Parts`, reading `data/parts.json`.
  - `lookup` matches the model with case/space-insensitive Levenshtein distance ≤ 2. Map the symptom to a symptom key with simple keywords ("heat", "cold", "warm" → `no_heat`).
  - `isIdentical` strips non-alphanumerics, uppercases, and compares against partNumber + crossRefs, also accepting a match with a "WP" prefix added or removed.

## Tests (`node --test` via `npm test`)
- `reserve` blocks the 9th guarded call.
- Three concurrent reserves for the same vendor block the 3rd (loop).
- An exempt lane's 3rd attempt is blocked.
- `checkQuote` rejects a $59 landed total at a $40 cap, with a reason mentioning "$59.00" and "$40".
- `canAdvanceInstall` blocks the last step without acks and allows it with both.
- `parts.lookup('wed 4815 ew','no heat')` → WP3392519. `lookup('WED4851EW', …)` is still found.
- `isIdentical('3392519')` and `isIdentical('wp-3392519')` are true; `'WP339251'` is false.

## Don'ts
Don't edit any file outside your list. Don't place calls or import vapi/*. Don't change contracts/types/config. If a contract is truly insufficient, note it at the top of your final report.

**Acceptance:** `npm run typecheck` and `npm test` pass.
