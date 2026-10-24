# Guardrails

Every Unsupervised-track limit is enforced in server code and announced as a `guard` event with a deterministic reason. Three trip on stage: budget, no_answer, and the install safety gate. The kill switch is the Q&A demo.

## Sub-features

- `budget`: a landed total over $40 (consumer) is rejected and never ranked.
- `no_answer`: a supplier that doesn't answer is skipped, with no retry.
- `install-gate`: the "plug in / restore power" step is refused until `unplugged` and `vent_cleared` are acked.
- `kill-switch`: `POST /jobs/:id/stop` → STOPPED, live calls ended, nothing further happens.
- `caps`: max calls, minutes, per-vendor, stuck, agent spend, allow-list, keywords. Unit tests cover these (`test/guards.test.ts`).

## How to get to it (user POV)

- Budget and no_answer trip on every dryer journey (Valley $59, Coast declines).
- The install gate trips when the delivery-call agent tries the restore-power step early.
- Kill switch: the operator runs `curl -X POST /jobs/<id>/stop` (in Q&A).

## Driving it with fixie-verify

Preconditions: a healthy run, then `$S reset`.

- **Budget and no_answer.** Run a dryer journey (`$S demo-sim`, or the stepwise intake). Then:
  - `$S wait-event '.type=="guard" and .data.kind=="budget"'` → reason `Valley Appliance Parts quoted $59.00 landed. Over the $40 budget, skipped.`
  - `$S wait-event '.type=="guard" and .data.kind=="no_answer"'` → `Coast Supply didn't answer. Skipped, no retry.`
  - Downstream: `best_deal.supplier` is PartsDirect, never Valley.
- **Install gate.** First `$S api POST /demo/sim-intake '{}'`, then `$S wait-state ORDERED 60`, then `$S api POST /simulate/delivered '{}'`, then **immediately** `$S probe-install 7`.
  - The reply starts `Not yet. Can't go to step 7 yet. First confirm the dryer is unplugged and the vent is cleared.`
  - `$S wait-event '.type=="guard" and .data.kind=="safety"' 5` shows `step:7`.
  - The job still reaches FIXED once the sim's real acks land (`$S wait-state FIXED 60`).
- **Kill switch.** Run `$S api POST /demo/sim-intake '{}'` and `$S wait-event '.type=="call_started" and .data.lane=="supplier"' 30`. Then stop the newest job with `$S api POST /jobs/$(curl -s localhost:3100/jobs | jq -r 'last.id')/stop '{}'`.
  - The response shows `"state":"STOPPED"`.
  - The in-flight calls get `call_ended` with `endedReason` `assistant-ended-call`.
  - No `quote`, `best_deal`, or `order_confirmed` is emitted after the stop.
- **Caps.** Run `$S check` → tests pass, with `guards.test.ts` included.
- **Proof.** Run `$S capture guardrails-<sub-feature>` after each one.

## Gotchas

- **The install gate only guards the restore-power step (step 7)**, which matches the PR spec. `$S probe-install 5` sent before any ack is *accepted* ("Step 6 of 7…"), so the agent can walk Dorothy through pulling the fuse wires before she has confirmed the dryer is unplugged. Observed 2026-10-24. Raise it with the user; don't "fix" the recipe.
- Run `probe-install` right after `/simulate/delivered`. The sim acks both checks about 1–2 s later, after which step 7 is legitimately allowed.
- Keyword escalation (smoke/burning/gas) has no sim entry point; only unit tests cover it.
