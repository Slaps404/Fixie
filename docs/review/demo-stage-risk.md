## Findings (demo-stage-risk)

**1. BLOCKER: the stuck and callback timers can't fire inside a 3:00 demo.**
- What breaks: the SPEC §5 stuck guard is 150 s and the callback timeout is 120 s. The Unsupervised track needs a visible stop, but §8 only shows a voicemail skip. The callback also waits for all legs, so a ringing-out voicemail leg can stall it for 120 s.
- Fix, SPEC §5, §4 and §9: add env overrides `GUARD_STUCK_S`, `CALLBACK_TIMEOUT_S` and `SUPPLIER_MAX_DURATION_S`. Demo values are 15, 25 and 40.
- Fix, callback trigger: fire when warranty plus at least 2 supplier legs have ended, or 8 s after the last answered leg, whichever is first.
- Fix, §8: replace the "voicemail" leg with a hold-and-go-silent leg. The teammate says "please hold" and goes quiet. The 15 s stuck guard fires `guard{stuck,stopped}` on the board. Keep voicemail as a pre-staged skip, not a live beat.

**2. BLOCKER: the time budget doesn't fit.**
- Intake (disclosure, symptom, electric vs gas, character-by-character model readback, tool call, summary) takes 70–90 s in a noisy room. §8 gives it 45 s.
- Sourcing also starts on the intake `end-of-call-report` (§4). That report lags the hangup by 5–15 s because of analysis.
- Fix, §4: start `runSourcing` on the `start_job` tool call. Dorothy's spoken summary then overlaps the first ring.
- Fix, intake prompt: "Accept all facts given in the first utterance. Ask only for what is missing. Read the model back once, in chunks (W-E-D / 4-8-1-5 / E-W)."
- Fix, rehearsal: Dorothy opens with all facts in one breath.

**3. HIGH: the audience can't hear the calls, and the spec has no audio plan.**
- Speakerphone against a PA loops the AI's voice back into the phone mic, and Vapi then self-interrupts. A noisy MPR makes it worse.
- Fix, Dorothy leg: use a Bluetooth conference speakerphone (Anker PowerConf or Jabra class, hardware echo cancellation) or a JBL-type speaker in call mode. Keep it at 40% volume, 30 cm from her. Don't use a PA, and don't use the laptop as audio. Rehearse in the room at 4:30.
- Fix, vendor legs: don't pipe them anywhere. Seat the warranty or "PartsDirect" actor in the front row with the phone on speaker and ringer at max. The audience hears the ring and both sides of the call acoustically. The other vendor actors stay in the hall, and their legs show on the board lanes.
- Fix, board: show live captions of the audio the audience hears, and label them "Audit log".

**4. HIGH: the phones won't ring or won't connect.**
- Fresh Twilio numbers are often flagged "Scam Likely".
- On iOS 26 and Android, call screening ("Screen Unknown Callers", Silence Unknown Callers, DND) swallows the call. The screener also trips Vapi voicemail detection.
- Fix, checklist: every actor saves the Twilio number as a contact. They add it to the Focus/DND allow-list with emergency bypass, turn call screening off, and set the ringer to max.
- Fix, test: make one real test call to each phone from the stage spot at 4:00. Test each carrier. Fall back to Wi-Fi calling if the MPR has no signal.
- Fix, roster: if Dorothy's caller ID is hidden, the callback target is empty. Add `roster.dorothy` as the callback number and ignore the inbound number.

**5. HIGH: the tunnel will die on the venue network.**
- A `cloudflared` quick tunnel changes URL on restart. The Vapi tool `server.url` goes stale, so tool calls fail silently and the agent says "something went wrong". Campus networks often block QUIC on UDP 7844.
- Fix, §9: run `cloudflared tunnel --protocol http2`, and run `ngrok http 3000` in a second terminal as a warm spare. Use a phone hotspot as the uplink.
- Fix, add `npm run preflight` (a new `scripts/preflight.ts`) that does the following:
  - Hits `PUBLIC_URL/health` from outside.
  - Asserts the assistant's serverUrl equals `PUBLIC_URL`.
  - Checks the Vapi credit balance.
  - Confirms the number is attached.
  - Prints a pass/fail line per roster phone.
- Rule: never restart the server after preflight. The `callId` map is in memory, and a restart orphans in-flight webhooks.

**6. HIGH: "skip ahead to step 5" breaks state and bypasses the safety gate.**
- Jumping `install_progress` from step 1 to 5 skips "unplug the dryer". Corgi's judge will catch that, and it contradicts the §5 safety guard.
- Fix, §4 delivery: step 1 (unplug and confirm) is a non-skippable gate. The assistant must hear "it's unplugged" first.
- Fix, `install_progress`: accept `{step, skippedBefore}`. The server emits `install_step` for steps 2–4 with `data.skipped:true` and moves INSTALLING forward only if step 1 is confirmed.
- Fix, demo: Dorothy says "It's unplugged, the back panel is off, I'm holding the new fuse." The agent confirms the unplug, jumps to the replace step, then asks "Is it warm?".
- Prop: put a real thermal fuse and a multimeter on the table.

**7. HIGH: DRY_RUN is all-or-nothing, so the fallback ladder is unusable.**
- §1 and §8 have one global `DRY_RUN`. There is no per-leg switch, no audio-clip playback (`simulator.ts` only has transcripts), and no "simulated" labeling.
- Fix, `src/config.ts`: add per-lane mode `MODE_intake|supplier|callback|delivery|tech=live|sim`, switchable at runtime via `POST /demo/mode`. Bind keys 1–4 to it on a presenter-only page.
- Fix, events: every simulated event carries `simulated:true`. The board shows an amber SIMULATED badge on those lanes.
- Honesty rule: never run sim unlabeled. Punn Kam will check the Vapi dashboard.

**8. MEDIUM: the "Simulate delivery" button and a screen-based board can fail the No App rule.**
- Judges watch the presenter click a UI to advance the user's flow. Chat-bubble transcripts look like the user's app.
- Fix, §4 and HANDOFF Lane B: remove the click. Fire `/simulate/delivered` from a hidden hotkey, or from a `curl` alias. The board shows "UPS webhook received (simulated)".
- Fix, board: add a persistent header, "OPERATOR AUDIT VIEW. Dorothy never sees a screen." Style it as a log table, not chat bubbles. Dorothy stands away from the laptop with only the speaker puck.
- Fix, port beat: `curl /fault` is machine-to-machine. Say so out loud.

**9. MEDIUM: Punn Kam's "is this staged?" test.**
- Fix, vendor scripts: every vendor adds one off-script twist ("$9 plus $4 shipping", "which part number again?"). `extract.ts` must handle both.
- Fix, opening line: "Suppliers are played by friends. Prices come from real listings."
- Fix, proof: keep the Vapi call log and the Twilio call log in a background tab to show real call IDs.
- Fix, model-number lookup: make `parts.lookup` fuzzy (edit distance ≤2 against 3 seeded models), because STT will mangle "WED4815EW" in a noisy room.
- Ask the judges: add a "reset and call again" offer only if a judge's phone is pre-verified.

**10. LOW: the deadline in SPEC §0 says 6:20 and HANDOFF says 6:30.**
- Use 6:20 as the internal time.

## Fallback ladder (operator calls it, no debate)
| Level | Trigger | Action |
|---|---|---|
| L0 | All legs are live | Run as planned |
| L1 | A vendor call has no ring or answer 10 s after `call_started` | Flip that lane to sim. Never retry in the demo. |
| L2 | Two vendor legs fail, or any Vapi 4xx/5xx | `MODE_supplier=sim`. Intake, callback and delivery stay live. |
| L3 | Intake has no first utterance within 8 s of connect, or the tunnel is down | Hang up and redial once. If it fails again, run the all-sim mode with the recorded clips. |
| L4 | L3 also fails, or no board | Play the backup video, narrate live, and show the real call logs from rehearsal. |

## Revised run of show (live legs; hard 3:00)
| Time | Beat |
|---|---|
| 0:00–0:12 | Hook, "Dorothy, 74, dryer won't heat." Dial the number. |
| 0:12–0:50 | Intake call, which already carries all the facts. `start_job` fires sourcing. |
| 0:50–1:30 | Three outbound legs. The front-row phone rings aloud. The presenter narrates caps, vendors and "compares quotes". The hold-silent leg triggers the stuck stop at 15 s. |
| 1:30–1:55 | Callback ring, "$9 vs $200, Tuesday, say yes", then "yes". |
| 1:55–2:35 | Hidden delivery hotkey. Delivery call, unplug confirmation, skip to step 5, "It's warm!" |
| 2:35–2:50 | `curl /fault`. Show the pre-run port job, labeled SIMULATED. |
| 2:50–3:00 | Close: who pays, "building Monday". |

## Pre-demo checklist
1. `npm run preflight` is green: tunnel, assistant URL, credit, number.
2. Warm spare tunnel and a hotspot are ready.
3. Every actor has the contact saved, DND allow-list set, screening off, and has taken one real test call.
4. Roster is final: 3 vendor actors plus Dorothy.
5. Speaker puck and the model sticker are on the table.
6. `/demo/reset` runs, then one full live rehearsal in the room at 4:30.
7. Backup video recorded at 5:30. Clips and sim mode tested, with the SIMULATED badge visible.
8. Keys 1–4 mapped. One person owns the mode switch, the other speaks.