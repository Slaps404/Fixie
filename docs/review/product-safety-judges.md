## Blockers

1. **Unauthenticated callback target (scam vector).** `start_job({callerName, phone, ...})` takes `phone` as a model-supplied argument.
   - **Break:** anyone can call and say "my number is <victim>". Fixie then cold-calls the victim with an AI voice and asks for a "yes".
   - **Fix (§4 and §6):** ignore the `phone` argument. Use `message.call.customer.number` from the Vapi webhook. Add guard `callback_target_mismatch`. Allow user callbacks only to the inbound caller ID, within 72 h of the intake call.

2. **Fixie looks exactly like the scam it claims to oppose.** The pitch cites "$3.0B elder fraud", and then an unknown number rings a 74-year-old and says "AI, recorded, say yes to order."
   - **Fix (§4 and §5):** the callback opens with "You called Fixie at 2:14 about your dryer. If you'd rather, hang up and dial us back; I'll pick up the same job." Calls from a known number with an open job resume that job by caller ID.
   - Add a hard rule that Fixie never asks for a card, SSN or payment details by voice.
   - Add a `scam_safeguards` line to the pitch and Q&A.

3. **Dryer safety gate is prompt-only, which contradicts "enforced in code".** A blown thermal fuse usually means an overheated, clogged vent. Replacing the fuse without clearing the vent is a fire risk.
   - **Fix (§5):**
     - Set the WP3392519 tier to `diy_with_caution`.
     - Add a mandatory `vent_cleared` step to `install_steps`, and make the server reject `install_progress` past "restore power" until `vent_cleared=true`. Emit `safety_ack` events for "unplugged" and "vent cleared".
     - Add a keyword hard-stop on the symptom text and on mid-call speech (smoke, burning smell, scorch, gas smell, "someone with me?" fails, confused-sounding caller). The action is `pro_required`, or 911 for gas or smoke. These checks are missing from the §5 table.
     - Never describe bypassing the fuse.
   - **Pitch line:** "Fixie won't let her power it back on until the vent is clear."

4. **Stuck guard is unreachable.** Stuck fires at 150 s of no state change, but the callback timeout is 120 s, so the callback always fires first.
   - **Fix (§4 and §5):** callback timeout 150 s. Stuck means 90 s with no transcript or call event on any open call.
   - Unsupervised needs one *visible* stop. Add a scripted supplier quoting $55 (over the $40 cap) so the demo shows `guard{budget,stopped}`, and then "couldn't get under $40, keep going?" to Dorothy. Voicemail-skip alone isn't a stop.

## High

5. **Warranty call is theater.**
   - The Whirlpool warranty is 1 year on parts, and Dorothy's dryer is from 2019, so the answer is always "no". Manufacturers don't ship free fuses to third-party AI callers without the owner's authorization and serial number.
   - The intake also never collects purchase date or serial, so the warranty call has nothing to say.
   - **Fix:**
     - Add `purchaseYear` to `start_job` and the intake prompt.
     - Rename the step "warranty check" in pitch and board, never "free part".
     - Say: "Takes 20 seconds, for dryers it's usually expired."
     - Move the credible warranty story to the port beat. A NOx sensor on a heavy-duty engine often falls under federal emissions warranty, so make that persona's call return `covered:true` in dry-run.

6. **"Cheapest identical" with teammate suppliers.**
   - `identicalPart` comes from an LLM reading a transcript. "Price" ignores shipping, so "$9 + $12 ship" beats "$18 free ship".
   - **Fix (§3 `extract.ts` and the `Quote` type):**
     - Require the supplier to read back the part number. Compute `identicalPart` in code by normalizing against `crossRefs`.
     - Add `shipping` and `landedTotal`, and rank and cap on `landedTotal`.
     - Add a `catalog` baseline row (PartSelect, RepairClinic, Amazon) from `pitch/part-prices.md`.
     - Label the board "role-played suppliers" on stage.

7. **Spoken "yes" is weak spending authority.** Headset echo or a bystander can say yes.
   - **Fix (§4):** the callback reads back "WP3392519, Valley Appliance, $X total, arrives Tuesday." The assistant requires the phrase "order it" and calls `record_order_decision` once. Make it idempotent per job and log the transcript snippet in `order_confirmed`.
   - **Payment:** who pays is unanswered (PLAN promised a virtual card; the spec says "mocked"). Pitch answer: the supplier invoices or sends a payment link to a caregiver, so Fixie never holds card data.

8. **Consent and legal gaps.**
   - The spec says "disclosure", but PLAN said ask consent (California Penal Code 632 is all-party).
   - Dorothy is never asked for permission to call back or to call days later about the delivery (TCPA, AI voice).
   - **Fix (§6 `prompts.ts`):**
     - First message: "I'm an AI assistant; calls are recorded. OK to continue? And OK to call you back on this number about your repair?"
     - Set `artifactPlan.recordingEnabled=false` on "no".
     - Emit a `consent` event.
     - Add guards for quiet hours (8am–9pm local), at most 3 user-call attempts, and a "stop calling" flag.
   - On the supplier side, hang up if the vendor objects to recording or to talking to an AI.

9. **Budget is hard-coded at $40 for all lanes.** A NOx sensor costs $300+, so `/fault` would hit `budget` immediately.
   - **Fix (§5):** per-lane caps in `config.ts` (`consumer:40`, `tech:1500`). The tech lane needs a "yes" from the tech.
   - Track Vapi `cost` from each `end-of-call-report` into the budget meter. Right now Fixie's own spend is unmetered, and that is the "overspending" the track asks about.

## Medium

10. **"Money saved" counter conflates two things.** "$191 saved" is DIY versus a tech visit. It is not sourcing savings, which are $9 versus $18. Corgi and the VC will catch it.
    - **Fix:** two counters, "vs tech visit" and "vs next-best quote". Pitch only the second as Fixie's edge.

11. **Diagnosis overclaims.** `confidence: 0.82` is not computed, and "no heat" can also be the element, a thermostat or a gas valve.
    - **Fix:** drop the number, or label it "lookup prior". Add continuity test as step 1 of `install_steps`, ahead of "swap", and say "most likely".
    - Add a 10-row symptom→part replay table so you have one honest accuracy number for the Agentin judge.

12. **Port beat reads bolted-on.**
    - The spec has no safety-gate behavior on `/fault`, though POSITIONING promised one.
    - `curl` and dry-run next to a live consumer call reads as fake. And the buyer story (enterprise) is told after the demo (consumer).
    - **Fix:**
      - `runFault` emits a `safety` event, "high-voltage battery work → refused, logged".
      - Frame the pitch as "Dorothy is zero-screen, the tech is zero-hands: one dispatcher".
      - Show a real J1939 SPN/FMI decode (SPN 3226 is aftertreatment NOx).
      - Label the beat "simulated Samsara webhook".
      - Drop the defense line, or restrict it to "installation facilities". Vapi and Twilio are not FedRAMP-authorized.

13. **PII on the projected board.** `events.jsonl` and the board show the phone number, name and transcripts.
    - **Fix:** mask the phone to the last 4 digits in `events.ts`. Tell the audience Dorothy is a dramatized persona.

14. **Durability.** In-memory jobs mean a restart mid-"Tuesday" loses the multi-day story.
    - **Fix:** reload the snapshot on boot (about 10 lines), and say "delivery is simulated by button" out loud.

## Per-judge pokes and answers

- **Voice founder (Punn):** he will ask about IVR, human handoff and barge-in. The spec has none of these.
  - Add Vapi `transferCall` to Jianan's phone on "person".
  - Say "IVR = treated as stuck, skipped, logged."
  - Give a number from the real counter test call.
- **Background-agent founder (Metehan):** "Where is the multi-day part?" Answer with the persisted snapshot, the scheduled delivery call, and the metered budget (item 9).
- **Insurance founder (Corgi):** "Who's liable for a dryer fire?" Answer with `safety_ack` events, the vent gate, and a disclaimer line in the intake. Show the risk-log view.
- **VC (Neel/Pavan):** "Who pays, and why phone for a $9 part?"
  - Answer: B2B2C. Home-warranty companies, insurers and senior-living operators pay per resolved case. Estimate roughly $2 of Vapi cost per job (verify).
  - Answer: the phone is the interface for a user with no screen. Calling matters for local stock and parts not listed online.
  - Never claim consumers pay.

## Small fix

Spec says submit 6:20 PM and HANDOFF says 6:30 PM. Pick 6:20 as the internal deadline and make the spec say so.