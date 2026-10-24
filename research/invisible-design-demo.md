## 1. Invisible-interface principles applied to "Open repair"

Principles (practitioner consensus, not a standard; see [Think Design](https://think.design/blog/beyond-screens-the-rise-of-zero-ui/) and [Think Design Substack](https://thinkdesign.substack.com/p/zero-ui-interfaces-what-they-mean)):
- The interface is the user's existing behavior, which here is a phone call. Nothing to install, sign up for, or learn.
- The system is proactive and holds context. It calls back, remembers the case, and doesn't make the user re-explain.
- Feedback comes through audio, not visuals. The agent repeats back what it heard and confirms before spending money.
- Errors are recoverable by voice: "I didn't catch that, let's try the other way."
- Transparency matters more when nothing is visible. The agent says it is an AI, says what it will do, and says what it spent.

**Zero-screen flow (voice-only, with no step that needs the user to look at anything):**
1. **Call or answer.** The user dials a memorable number. Or they say "call my repair helper" to a landline or smart speaker. Or the agent calls first after a missed-call text from a family member.
2. **Describe the problem.** The agent says "Hi, I'm an AI repair helper. What's broken?" and asks 3 to 5 diagnostic questions. Sounds help here ("hold the phone near it, I'll listen for the buzzing").
3. **Identify the model by voice.** "Tilt the label toward you and read me the numbers after 'Model'." The agent reads them back digit by digit ("that's B-as-in-boy 4-2-7... correct?").
4. **Walk through the fix by voice.** One step at a time, with "tell me when you're done." Safety steps come first: unplug it, wait 5 minutes.
5. **Part needed.** The agent says "I'll find the part and call you back in a few minutes. Okay to hang up?" and ends the call.
6. **Autonomous sourcing.** It calls suppliers, collects quotes, and negotiates.
7. **Callback.** "The best price is $23, shipped Thursday. Want me to order it? Say yes." The user confirms by voice, or says "ask my daughter," and the agent calls the daughter.

**Is MMS photo acceptable under "No App"?** The rule says "projects where users must look at a screen do not count" (event page: https://luma.com/compiled-im3b). Taking and sending a photo means looking at a screen, so make photo strictly optional and never the main path:
- **Primary path:** voice-only, with the nameplate read aloud (step 3).
- **Fallback for hard-to-read labels:** the agent says "give me the brand and a rough size, and I'll search." It can also call back later to confirm the model.
- **Optional caregiver path:** a family member texts the photo to the number. The senior never touches a screen, and the agent can call the senior with "your daughter sent me a photo of the label." Frame it as "caregiver in the loop," not "user looks at a screen."
- **Do not use MMS or FaceTime as the headline demo.** If you show them at all, label them as an accessibility bonus.

## 2. Track recommendation

- **Primary: No App.** It fits exactly: seniors, a phone call, voice only, no screen. It is also the easiest track to demo in 3 minutes with a judge's own phone.
- **Secondary: Unsupervised.** Supplier calling is the unattended part. The agent runs a multi-call loop for a long time without the user. To qualify, show it:
  - Has a **budget cap and call cap** (for example, at most 8 calls or $X in spend).
  - Detects **loops**, such as calling the same supplier twice, or hearing the same voicemail or IVR repeatedly.
  - Detects **stuck** states (silence, IVR dead ends, 90 seconds with no progress) and **knows when to stop**. It escalates by calling the user or caregiver: "I couldn't find it under $40, want me to keep looking?"
  - Writes a visible **audit log** for judges (one-line screen, not for the user).
- **Third: the 1B Consumer track** is plausible ("repair gap, global scale") but the weakest pitch. Mention global scale in one closing sentence only.
- **Submit to one track plus Unsupervised if allowed.** Check the form. If only one is allowed, pick No App and show the guardrails in the demo anyway.
- **Judge fit:** the Conduit/Agentin/Clean/Corgi judges (YC voice and agent companies) will care about reliability and guardrails. Show a real failure being handled.

## 3. Three-minute demo script

Setup: one speakerphone or a judge's phone. Teammate "Supplier" sits across the room with a second phone. Pre-register the numbers in Twilio or Vapi (trial accounts only call verified numbers).

| Time | Beat |
|---|---|
| 0:00 to 0:20 | **Hook.** "Grandma's AC died. She can't use an app. She picks up the phone." Hand the judge the phone. |
| 0:20 to 1:00 | **Diagnose by voice.** Judge dials the number and says "my air conditioner is blowing warm." The agent asks 2 questions, has the judge read a model number from a prop sticker, and says "that's a capacitor, I'll find the part." Agent says "okay to hang up?" |
| 1:00 to 2:15 | **Wow moment.** The agent live-calls the teammate on speakerphone. The teammate plays the distributor and quotes $38. The agent says "Another supplier quoted $27, can you match?" The teammate agrees to $29 or says no. The agent then calls a second "supplier" (a second AI voice on a laptop is optional). Show the one-line audit log on the projector: calls made, running cost, cheapest quote. |
| 2:15 | **Guardrail beat.** The teammate plays a voicemail or IVR loop. The agent says "stuck, skipping" and moves on (this satisfies Unsupervised). |
| 2:30 to 2:50 | **Callback.** The judge's phone rings. "Best price is $29 with free shipping, say yes to order." Judge says yes. |
| 2:50 to 3:00 | **Close.** "No screen, no app, savings of $9 on a $38 part. Scale this to a billion people who can't DIY." |

**Fallbacks:**
- **Live call fails (carrier or API):** keep a pre-recorded 60-second screen-recorded video of a clean run, plus a "dry run" mode where the backend plays supplier audio clips through the same agent logic.
- **Venue network or cell is bad:** use venue Wi-Fi hotspot as backup, and test an inbound call from the actual judge's carrier before 7:45 PM.
- **Supplier teammate doesn't answer:** the agent should have a hardcoded timeout, then fall back to a second teammate or a pre-recorded voicemail. This also shows the stuck-detection.
- **Judge refuses to give their number:** use a teammate's phone as "user," with the judge listening on speaker.
- **Practice the demo end to end at least 3 times** before 6 PM. Cache the TTS for the callback line.

## 4. Build order (about 4.5 hours)

Compliance note: the FCC treats AI-generated voices as "artificial" under the TCPA, so consent and caller identification are required ([Orrick summary](https://www.orrick.com/insights/2024/02/Did-the-FCC-Really-Ban-AI-Generated-Voice-Calls-No-But-Restrictions-Apply)). I did not check whether the ruling has since changed. Have the agent announce itself as an AI on every call, and call only teammates' verified numbers in the demo. Don't cold-call real suppliers.

Stack suggestion: a voice-agent platform (Vapi or Retell) with Twilio numbers and a small webhook server. I could not confirm current Vapi docs for outbound call and webhook behavior from search, so verify against the official docs before relying on this.

- **Slice 0: end-to-end skeleton (0:00 to 0:45).** Inbound number picks up, a hardcoded script says "I'll call you back," triggers one outbound call to your teammate's phone, then calls the user back with a canned line. *Done when:* a call in produces a callback and a supplier call, with no human touching a laptop.
- **Slice 1: voice diagnosis (0:45 to 1:30).** An LLM-driven conversation with 3 to 5 questions, plus model-number readback ("is that B-4-2-7?"). Pre-load 2 or 3 demo appliances. *Done when:* a stranger can describe the AC problem and the agent names the part correctly.
- **Slice 2: guided fix (1:30 to 2:00).** Step-by-step spoken instructions with confirmation prompts and a safety-first step. *Done when:* the agent walks through 3 steps and handles "wait, what?" by rephrasing.
- **Slice 3: supplier-calling agent (2:00 to 3:00).** The agent calls 2 supplier numbers, asks for a part price and stock, and logs quotes. *Done when:* the teammate gives a price and the agent writes it to the log correctly.
- **Slice 4: negotiation and guardrails (3:00 to 3:40).** Counter-offer using the best other quote, plus a call cap, spend cap, loop and silence detection, and escalation call. *Done when:* a simulated voicemail loop gets skipped and a cap-hit triggers the "want me to keep going?" call.
- **Slice 5: callback and order confirmation (3:40 to 4:05).** Final summary call, "say yes to order," and a caregiver notification text. *Done when:* the callback reads the correct price and the yes is recorded.
- **Slice 6: demo hardening (4:05 to 4:30).** Dry-run mode, the backup video, an audit-log projector view, and three full rehearsals. *Done when:* three consecutive clean runs on the venue network.

**Cut list if behind:** drop the second supplier, then the caregiver text, then the optional photo path. Never cut the callback or the guardrail beat.

Sources: [event page](https://luma.com/compiled-im3b), [Orrick on FCC AI-voice ruling](https://www.orrick.com/insights/2024/02/Did-the-FCC-Really-Ban-AI-Generated-Voice-Calls-No-But-Restrictions-Apply), [Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2024/02/fcc-declares-authority-and-intent-to-regulate-ai-generated-calls-under-the-tcpa), [Think Design](https://think.design/blog/beyond-screens-the-rise-of-zero-ui/), [Think Design Substack](https://thinkdesign.substack.com/p/zero-ui-interfaces-what-they-mean).