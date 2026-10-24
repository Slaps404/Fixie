# #11 (Round 3, DO NOW) Live diagnosis with a multimeter: the probability bar moves
**Owner:** Lane A · **Est:** 90 min · **Starts after:** the review/verify round lands (it edits `orchestrator.ts`)
**Why:** the main answer to "isn't this just OpenClaw with a phone skill?" The agent forms hypotheses, has Dorothy run a safe test, and visibly changes its mind. Aimed at Agentin (reasoning/evals). Source: `research/round3/SYNTHESIS.md` §4.1, `research/round3/deep-tech-moats.md`.

## Build
- `server/data/faults/dryer_no_heat.json`: hand-written fault tree for an electric dryer with no heat. Hypotheses with priors: thermal fuse (WP3392519) ~0.45, heating element ~0.25, high-limit/cycling thermostat ~0.15, timer/control ~0.10, power/breaker (one leg of 240V) ~0.05. Tests with likelihoods P(result | hypothesis):
  - `breaker_check` (both breakers on? drum spins?): no meter needed, ask first.
  - `fuse_continuity` (meter on beep/ohms across the fuse terminals, **dryer unplugged**): open → fuse ≈ 0.97.
  - `element_continuity` (~10 Ω normal; open → element).
  - `thermostat_continuity`.
  - Each test has `safetyCost` (0 = look/listen, 1 = unplugged continuity test) and a `requiresAck: ["unplugged"]` list.
- `server/src/diagnosis.ts` (pure, unit-tested): `posterior(prior, observations)`, `nextTest(state)` = max expected information gain ÷ (1 + safetyCost) over tests whose acks are satisfied, `isConfident(state)` = top hypothesis ≥ 0.85.
- New Vapi tool `record_test(test, reading)` on the intake assistant. The webhook routes it through `orchestrator.handleTool`. It returns the next instruction text plus the current top hypothesis. An ambiguous reading ("I don't know", "it flickers") is recorded as unknown and never lets the job pass the gate. After 2 unknowns, escalate to a pro.
- `start_job` fires only once `isConfident` is true (or the caller refuses to test, in which case fall back to today's symptom lookup and say so).
- Emit a `diagnosis_update` event: `{ test, reading, posterior: {fuse:0.97, element:0.02, …}, next: "element_continuity" | null, reason }`. The `reason` is built deterministically in code (e.g. "Fuse open → P(fuse) 0.45→0.97"), not by the LLM.
- Prompt: the meter is optional. With no meter, ask the no-tool questions (drum spins, any warmth at all, vent hood airflow when running) and update on those.
- Sim: add a scripted `record_test` sequence to `vapi/sim.ts` so `demo:sim` shows the bar moving.

## Board (Lane B)
Horizontal probability bars per hypothesis, animated on `diagnosis_update`, with the reason line underneath.

## Caveat to say on stage
"The likelihoods are expert-written, not learned. Every confirmed fix tunes them later."

**Acceptance:** unit tests for `posterior`/`nextTest`, `/verify` dryer recipe still passes, sim shows ≥2 `diagnosis_update` events with the fuse ending ≥0.85.
