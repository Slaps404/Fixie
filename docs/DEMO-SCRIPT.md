# Fixie: demo script (stage ≤ 1:55, video ≤ 60 s)

## Roles
| Who | Role | Where |
|---|---|---|
| **Presenter** (Jianan) | Talks to judges, runs the board | Laptop on the projector: judge board + `/admin` in a second tab |
| **Bao** | "Dorothy, 74", the caller | Phone held to the presenter's mic, or on speaker near the mic. Number **···5256** |
| **Zeke** | Whirlpool warranty line | Front row, phone ···6183 |
| **Aidan** | PartsDirect (the winner) | Front row, phone ···6648, **on speaker so the room hears it** |
| **Valley friend** | Valley Appliance (over budget) | Phone ···7613 |

**Before you go on stage:**
- Every role-play phone has **(619) 771-1086** saved as **"Fixie"**, with Silence Unknown Callers and Do Not Disturb **off**.
- Ringers on, volume up.
- Board open, `/admin` logged in (bao / bao).
- `npm run preflight` is all ✅.
- The backup video is cued in another tab.

---

## Stage run (hard cap 1:55: LIVE call → short montage → website)

### 0:00–0:08 · Hook (Presenter)
> "Dorothy is 74. Her dryer runs cold. The fix is a thirteen-dollar fuse, but a visit is a hundred and fifty. Watch."

### 0:08–0:35 · LIVE call (Bao calls (619) 771-1086, audio to the room)
- **Bao, in ONE breath:** "Hi, my Whirlpool dryer runs but blows cold. Model W-E-D-4-8-1-5-E-W, electric, 2019. No multimeter."
- **Fixie:** "Sounds like the thermal fuse. I'll call around and call you back with the best price."
- **Bao:** "Thanks!" → **hang up.** *(If it asks one quick check, answer in one word.)*

### 0:35–0:50 · LIVE wow: three phones ring at once
- **Presenter:** "She hung up. Fixie is calling the warranty line and two parts counters at the same time."
- **Aidan answers on speaker:** "Fifteen dollars with shipping, arrives Tuesday."
- **Presenter, pointing at the ⛔ on the board:** "Valley quoted fifty-nine. Code rejected it: over her cap. The limits live in code, not a prompt."
- *(Don't wait for the calls to finish.)*

### 0:50–1:30 · Short montage (press **M**, ≈40 s), the rest of a real run from tonight
"Yes, order it" + card capped at $15 → install coaching → **"It's smoking!" → it stops** → "It's warm!" + WhatsApp 🎉.

**Presenter:** "Spoken yes, capped card, coached install, and it knows when to stop."

### 1:30–1:45 · Website
> "Families sign up in thirty seconds: phone, code, card. Then Dorothy just calls one number."

### 1:45–1:55 · Close
> "Any agent can place a call. Fixie finishes the job, with every limit on her money and safety enforced in code. One number for anything that breaks."

---

## Submission video (≤ 60 s, `demo-assets/fixie-montage.mp4`)
Built from real recorded calls, with captions:
1. Hook card (3 s): "Dorothy, 74. Dryer runs cold. $13 fix vs a $150 visit."
2. The call (10 s): she describes it → Fixie: "thermal fuse".
3. Three waveforms at once (8 s) → Valley ⛔ over budget (5 s).
4. "Yes, order it" + capped card (8 s).
5. Install coaching (8 s) → "It's smoking!" → stops (7 s) → "It's warm!" + WhatsApp (5 s).
6. End card (6 s): website signup + "Call (619) 771-1086. One number for anything that breaks."

## If something goes wrong (don't debate it, just switch)
1. **A front-row phone doesn't ring:** keep talking. "One supplier didn't pick up, and Fixie skips it automatically." The other quotes still rank.
2. **No callback within about 90 s:** say "while it compares quotes…" and check `/admin`. Use the board's replay of the rehearsal run if needed.
3. **The delivery call runs long:** cut in after "it's warm" or say "and it finishes the remaining steps."
4. **The line is down:** the watchdog restarts it in about 10 s. Wait, then redial once.
5. **Worst case:** play the backup video. "Here's the same run from 30 minutes ago."

---

## Don't say
- "Negotiates." Say "compares quotes".
- "Calls the factory."
- "Diagnosis accuracy is X%." We have no labeled accuracy eval.
- "Learns from every fix." The fault tree is hand-written today.
- "Google can't do this." Google's AI can call businesses. Our edge is the finished loop plus code-enforced guardrails.
- "Real Amazon order." It's a sandbox card.
- Don't demo a gas dryer, and don't invite judges to call the number unless asked.

---

## Likely judge questions (15-second answers)
- **"How's this different from Google calling businesses or OpenClaw?"** "Calling is plumbing. We close the loop: diagnosis, warranty check, parallel quotes, a spoken-yes order, then the install call and a fix check. The guardrails are code, not prompts."
- **"Liability for guiding repairs?"** "We only guide manufacturer-documented, user-replaceable parts. Gas, refrigerant, and high voltage always go to a licensed pro. Safety gates are enforced server-side, and every step is logged. That makes it insurable."
- **"Will suppliers talk to a bot?"** "It discloses it's an AI, keeps calls under a minute, and asks one thing: price with shipping. Our test calls today worked, and real counter calls are the next step."
- **"Who pays?"** "Free to the caller. Paid per resolved case by home-warranty companies, insurers, and property managers, the people who'd otherwise send a $150 truck roll."
- **"What if it crashes mid-call?"** "systemd restarts it in about 10 seconds. Restarts wait for live calls to finish. Missed webhooks are recovered from Vapi's call record."
- **"How does it remember callers?"** "Per phone number: name, appliance, what they know (no multimeter), and consent. It never asks twice."
- **"Is the card real?"** "A Lithic sandbox virtual card capped at the exact total. The issuer declines anything over. Production uses the same rails."

---

## Timing checklist (rehearse 3×, stopwatch)
- [ ] Hook ≤ 8 s
- [ ] Live call ≤ 27 s (Bao: one breath)
- [ ] Phones ring and Aidan answers ≤ 15 s
- [ ] Montage ≈ 40 s (cued on M)
- [ ] Website ≤ 15 s
- [ ] Close ≤ 10 s → **total ≤ 1:55**
