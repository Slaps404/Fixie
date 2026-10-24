## Spec defects that block the ideas below (fix first)

- **[high] Callback number comes from the LLM.** `start_job({phone})` makes the model transcribe a phone number. A wrong digit means the callback rings a stranger. Fix §4: ignore `phone` in the tool args and use `message.call.customer.number` from the webhook. Add a `callerSelf` exemption to `vendor_not_approved`. The guard's own wording would otherwise block the callback to the caller.
- **[high] The stuck guard can't fire in a 3-minute demo.** Stuck is 150 s and the call cap is 180 s. Fix §5 so the thresholds come from config: `STUCK_SECONDS=25` and `CALL_MAX_SECONDS=45` when `DEMO=1`. Keep 150 s and 180 s for production.
- **[medium] Nothing manual stops a job.** Add `POST /jobs/:id/stop` to §3. It sets state `STOPPED`, emits `guard{kind:"manual",action:"stopped"}`, and ends live calls. Use Vapi `call.monitor.controlUrl` with `{type:"end-call"}` (verify). The board gets a red button.
- **[medium] The roster is static, so no audience member can take part.** Add `POST /roster/enroll {phone,role}` with a 15-minute TTL and a `consent:true` field.

## Ranked ideas (wow per build hour)

**1. The judge's phone rings. Wow 10, 30 min.**
- Run the supplier line live with a volunteer, not a teammate. Punn "will spot a staged demo". An unscripted human quoting any price proves the extractor works. If the quote is over $40, the budget guard fires on stage.
- Lane B adds a board field "Call me as a supplier". It posts to `/roster/enroll` with the role `supplier`.
- Lane A makes `runSourcing` read the roster at call time, not at boot.
- `extract.ts` must handle a missing price, "call back Monday" and a non-identical part.
- Risk: the volunteer says something strange. Keep teammate phones enrolled as a fallback and skip any call that goes unanswered after 20 s.
- Variant: the judge calls in as Dorothy. This works with no enrollment, because inbound is open.

**2. Visible kill moment. Wow 9 (Unsupervised track), 30 min.**
- Add a fourth supplier persona, "Hold Forever Appliance", scripted to say "please hold" on a loop.
- The stuck guard fires at 25 s. The board flashes red `guard{stuck}`, Fixie hangs up, and the callback says "one supplier wasn't responding, I skipped it."
- Then the presenter hits the red STOP button mid-job. The board shows STOPPED, the live call drops, and Fixie calls Dorothy: "I stopped. Nothing was ordered."
- Add a meter strip: calls 3/8, minutes 2.1/20, $9/$40.

**3. Caller-ID memory plus a cache-hit second call. Wow 8, 45 min.**
- Seed `data/customers.json` as `{ "+1…": { name:"Dorothy", appliance:"WED4815EW dryer", bought:2019, caregiver:"+1…" } }`.
- In `setup-vapi.ts`, leave the number without an `assistantId` and set `server.url`. Answer `assistant-request` (it must return fast; verify) with an assistant whose `variableValues` include the name and the dryer.
- The first message becomes "Hi Dorothy, is this about the dryer again?" A known model skips the character-by-character readback.
- `parts.lookup` emits `parts_cache{hit:true}`. The second run skips supplier calls: "last quote $9 at PartsDirect, 6 days old. Order again?"
- Say on stage that the seeded record is seeded. Do not claim learning from real traffic.
- Lane B draws a 10-line SVG graph: model, part, three supplier nodes with price edges. The cached node pulses on a hit. Budget 30 min.

**4. Caregiver closing call. Wow 8, 25 min.**
- On `fix_verified{ok:true}`, call the number in `customers.json`. Use a transient assistant with only a `firstMessage`: "AI assistant: your mom's dryer is fixed. $9 instead of a $200 visit. Installed at 3:41." Set `maxDurationSeconds: 25`.
- A friend's phone rings in the audience during the close.
- Add the consent line at intake: "Want me to tell your daughter when it's done?" Store a yes/no flag before dialing.

**5. "Watch the agent think" ticker plus metrics. Wow 7, 40 min, Lane B with 10 min of Lane A.**
- Add `reason: string` to `guard`, `quote`, `best_deal` and `job_state`. Build the strings deterministically in `guards.ts` and the ranker, for example "Skip Valley: voicemail" or "Pick PartsDirect: $9 < $18, identicalPart=true, inStock=true".
- Add a `metrics` event at callback time with three values: elapsed time, Vapi cost summed from `end-of-call-report` (verify the field name), and parallel versus serial call minutes (3 min vs 9 min).
- The board shows "Fixie cost $0.74 vs $200 tech" and "elapsed 3m40s".
- The ticker is code-generated, so it is honest and has no LLM latency.

**6. Proactive call via the fault engine. Wow 6, 20 min.**
- `POST /fault` with `{asset:"Dorothy's dryer", code:"CYCLE_TIME_3X", site:"home"}` and lane `user` calls her: "Your dryer is taking three times longer to dry, so the vent may be clogged. Want me to line up a fix?"
- It reuses `runFault`. Label the telemetry "simulated". This answers Meadow's "calls before they fail".
- It is cheap only if Slice 4 lands. Otherwise cut it.

**7. Spanish. Wow 6, 35 min, high risk.**
- Set the transcriber to a multilingual model (Deepgram `language:"multi"`) and the voice to ElevenLabs multilingual. Add one prompt line: "If the caller speaks Spanish, answer in Spanish. Keep the disclosure bilingual. Supplier calls stay in English."
- Run it only as a pre-recorded 15 s clip or a third-act bonus. Noisy-room ASR is the failure mode.
- It only makes sense if a Spanish speaker is available (see question 4).

**8. Real business call. Do not put it in the live path.**
- The demo is about 7:45 PM Saturday, so parts counters are closed.
- Call one at about 3:30 PM, with consent, as yourself or with Fixie after the AI and recording disclosure. Play a 10 s clip on stage: "today at 3:41 we asked a real counter".
- Risks of a live call: they hang up on a bot, they transfer you to a human, or you wait 90 s on hold.

## Run-order change (swap, don't add)
Keep the 180 s budget. Cut the 0:15 hook to 10 s. Take 15 s of the port beat and cut the `curl` to a single line. Insert the judge-supplier call at 1:00, the STOP moment at 1:35, and the caregiver ring at 2:50. Cut ideas 6 and 7 first. Never cut ideas 1 and 2.

## Five questions whose answers change the build
1. **Whose phone plays Dorothy, and how many people are in the room at 7:45 PM?** If remote, the board stays as it is. If in-room, ideas 1 and 4 get a ringing phone on stage.
2. **Can we ring a judge's or audience member's phone, and is the Twilio account paid and un-gated for arbitrary US numbers?** A "no" turns idea 1 into the judge calling in as Dorothy.
3. **Is a real business call allowed, and has Lane B already got one on record?** If yes, play the clip. If no, drop idea 8.
4. **Does anyone on the team or friend list speak Spanish, and is the venue quiet enough?** A "no" drops idea 7.
5. **Can we enter multiple tracks, and will remote judges (Anis, Leon) hear call audio over the video link?** If Unsupervised is not allowed, drop idea 2's guard meters and spend the hour on idea 3. If remote audio fails, the board ticker from idea 5 carries the demo.