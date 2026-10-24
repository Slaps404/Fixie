# Dryer journey

Dorothy calls about a dryer that runs but won't heat. Fixie diagnoses a blown thermal fuse, checks the warranty, calls three suppliers in parallel, and calls her back with the cheapest identical part. It orders only on her spoken yes. On delivery it calls again, walks her through the install behind safety gates, and confirms the fix.

## Sub-features

- `intake`: the inbound call → `consent`, `diagnosis` (WED4815EW, thermal fuse), `safety` diy_with_caution, `part_identified` WP3392519.
- `warranty`: a warranty-line call → `warranty` covered:false (out of warranty).
- `sourcing`: parallel supplier calls → a `quote` per supplier, with landed totals.
- `ranking`: `best_deal` PartsDirect $13.05, savedVsTech 186.95.
- `callback-order`: a user-lane call → "Order it." → `order_confirmed`, job ORDERED.
- `delivery-install`: `delivered` → a delivery call → `safety_ack` ×2 → `install_step` 1–7 → `fix_verified`, job FIXED.

## How to get to it (user POV)

- Dorothy dials the Fixie number. In sim, that's `POST /demo/sim-intake`.
- The package-delivered event: `POST /simulate/delivered` (the board's `D` key does the same).

## Driving it with fixie-verify

Preconditions: a healthy run, then `$S reset`.

- **Whole journey (the default proof).** Run `$S demo-sim`. It exits 0, and `demo-sim.txt` ends with 9 `PASS` lines and `demo:sim PASSED`. Then run `$S capture dryer-journey`.
- **Step by step.** For when you need to see one stage:
  - **Intake.** Run `$S api POST /demo/sim-intake '{}'` → `{"ok":true,"callId":"sim_N"}`. Then `$S wait-event '.type=="part_identified"' 20` shows `partNumber` `WP3392519`.
  - **Warranty.** `$S wait-event '.type=="warranty"' 30` shows `covered:false`.
  - **Sourcing and ranking.** `$S wait-event '.type=="best_deal"' 60` shows supplier `PartsDirect Counter`, `landedTotal` 13.05.
  - **Order.** `$S wait-state ORDERED 60`, then `$S wait-event '.type=="order_confirmed"' 5`.
  - **Delivery.** Run `$S api POST /simulate/delivered '{}'` → `{"ok":true,"jobId":"job_N"}`. Then `$S wait-state FIXED 60` and `$S wait-event '.type=="fix_verified"' 5` shows `ok:true`.
- **Proof.** Run `$S capture dryer-journey`. The timeline shows the job going NEW→DIAGNOSED→SOURCING→…→ORDERED→DELIVERED→INSTALLING→FIXED, and every sim event is marked `SIM`.

## Gotchas

- The sim delivery call reports progress only at steps 4 and 7. The server fills in the rest as `install_step` with `skipped:true`, so **5 of the 7 steps show as skipped** on the board. That's honest output, but it looks odd in a demo.
- In sim, the agent's "speech" is the server's tool result, verbatim. Some results are instructions to the model, e.g. "Ask them to run it on high… then call report_fix." They appear as agent transcript lines on the board.
- Ids stay monotonic across resets (`job_2`, `job_3`, …). Use `last.id` from `/jobs`, not `job_1`.
