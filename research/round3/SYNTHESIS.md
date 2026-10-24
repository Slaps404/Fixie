## 1. TL;DR
- **Concede the calls.** OpenClaw's voice-call plugin, Vapi/Bland skills, Google AI Mode, Gemini "Call for Me" and Meta Muse all place calls to businesses ([SEJ](https://www.searchenginejournal.com/google-search-can-now-call-local-businesses-using-ai)). Calling is plumbing, so don't pitch it as new.
- **What's ours is the closed loop.** Dorothy dials one number and gets a diagnosis, a safety gate, a sourced identical part and her spoken yes. Then a delivery event triggers a callback where we talk her through the install and confirm it works. We found no one shipping that loop.
- **The guardrails are enforced in code, not by the model.** Spend and call caps, a vendor allowlist, a stuck detector and a kill switch. OpenClaw documents only per-call limits (300s, 1 concurrent call) and no voicemail detection that we could find ([plugin doc mirror](https://cdn.jsdelivr.net/npm/openclaw@2026.7.1-2/docs/plugins/voice-call.md)).
- **The user needs no smartphone, app or setup.** OpenClaw sits behind WhatsApp, Telegram or iMessage, and Gemini needs a Pixel 11.
- **Moat: liability plus outcome data.** Callbacks produce fix/no-fix data, which a personal agent never collects and can't underwrite against.

## 2. Competitor map
| | Outbound calls | Multi-day | Buys | No smartphone | Safety gate |
|---|---|---|---|---|---|
| Google AI Mode | Y (home repair is single-source) | N | N | N | N |
| Gemini Call for Me | Y (Pixel 11) | N | Blocked | N | N |
| Meta Muse (beta, Sep 2026) | Y (some placed by humans, [404 Media](https://404media.co/meta-tests-muse-ai-agent-calls-that-are-actually-made-by-humans-in-a-call-center)) | ? | Claims to | N | ? |
| OpenClaw + skills | DIY | Cron | DIY | N | N |
| Pine | Y (bills) | Y | ? | N | N |
| Duckbill | Humans | Y | Y | Partial | N |
| Alexa+ / Angi | Marketplace API, not calls | N | ? | **Y** | N |
| Bernard (YC) | ? | Y | Parts prep | B2B | ? |

**Three real threats:**
1. Google/Gemini: distribution, and it already calls home-repair shops.
2. A DIY OpenClaw build: the teammate's objection.
3. The NextWave 2026 team ([Yuno](https://www.y.uno/en/newsroom/yuno-and-nauta-hackathon)): parallel carrier calls, ranked quotes, "agent proposes, code approves." That is our architecture, and it already won a local prize. Also expect another repair project in the pool: MaestrIA and Wrench Board placed at Anthropic's April hackathon.

## 3. The OpenClaw test
- **Replicable:** sticker diagnosis, part lookup, single or parallel calls, cron follow-ups, asking before buying.
- **Structurally ours:** an inbound number that serves any caller, a hard gate on dangerous repairs, a guided install with closed-loop verification, external spend enforcement, and outcome data.
- **Two sentences for a judge:** "Yes, OpenClaw can place these calls, and we'd use it as a commodity layer. What a personal agent won't do is take a call from a 74-year-old with a flip phone, refuse the gas repair, enforce spend limits it can't override, and call back to check the fix worked. That check is the data that lets us guarantee the repair."

## 4. Differentiators to add (wow × honesty × time)
1. **DO NOW: sequential Bayesian diagnosis with a multimeter (1.5h, person A).**
   - What: a hand-written dryer fault tree in JSON (thermal fuse, element, thermostat, igniter) with priors and likelihoods.
   - How: a Claude tool `update_beliefs(test, reading)`. The next test is picked by information gain per safety cost, and every step is gated on "unplugged" with continuity tests only. Register it as a Vapi tool and log the posterior on each turn.
   - Demo beat: "Touch the probes to the fuse. What does it read?" The posterior bar jumps to the fuse.
   - Caveat on stage: "The priors are expert-written, not learned."
2. **DO NOW: proof panel, live kill switch and a judge-callable number (~1.25h, person B).**
   - What: a live timeline of call legs, caps remaining, voicemail and stuck detections, $ committed, and "approved by: code."
   - Demo beat: a staged runaway trips the cap, then the kill switch stops it live. The number goes on the last slide with a per-caller cap.
   - Caveat: "The order is mocked."
3. **Second auction round (20m).** "Supplier B quoted $8.40, can you beat it?" Log the price change.
4. **Caregiver co-sign over $50 (15m).** A Twilio SMS to the daughter, and the order is blocked until she replies.
5. **CPSC recall check (45m).** `saferproducts.gov/RestWebServices/Recall?ProductName=dryer&format=json`, then Claude judges whether the recall covers this model. Say "none found in CPSC's database," never "no recalls." The Hazard parameter is reportedly broken, so filter client-side.
6. **Stripe Shared Payment Token mandate (90m), only if sandbox access works in the first 10 minutes.**
   - What: the spoken yes mints a token with max_amount set to quote plus shipping, a 24h expiry and one seller.
   - Demo beat: a charge at 2x the cap gets rejected by Stripe, and revoking the token stops later charges.
   - Caveat: whether the preview needs approval is unverified.
7. **Skip:** acoustic diagnosis (8 kHz phone audio, and a no-heat fault sounds normal), the smart-plug trigger (the Shelly plug's 16A rating is from memory and it isn't on a 240V dryer circuit), and escrow.

## 5. Bigger framing
**"Fixed, or we pay the pro."** This is the maintenance department for homes that don't have one. Every callback-verified fix prices the next guarantee.

- **One-liner:** "Fixie is the maintenance department for 50 million homes without one. One phone number, and the fix is guaranteed."
  - The 50M figure is unverified. On stage, use AARP's verified stat instead: 75% of adults 50+ want to age in place ([AARP](https://www.aarp.org/press/releases/2024-12-10-new-aarp-report-majority-adults-50-plus-age-place-policies-communities-catch-up.html)).
- **30-second pitch:** "Dorothy's 74, and her dryer won't heat. A tech visit is $200, and the fix is a $9 fuse. She calls one number, no app. Fixie tests the fuse with her by voice, refuses anything involving gas, phones three suppliers in parallel, and orders on her spoken yes, within limits its own code enforces. When the part arrives, it calls her, walks her through the install and confirms the heat is back. Every confirmed fix becomes data that lets us guarantee the next one. Any agent can make a phone call. Fixie closes the loop and stands behind the result. The same engine runs port tractors."
- **On stage, say "simulated pricing."** It is not real underwriting.

## 6. Template smells and tactics
**Smells to avoid:**
- Treating the call as the product.
- A chat UI over the call.
- Only fake vendors. Call one real parts counter to ask about stock.
- Empathy with no numbers. Show $9 vs $200, N calls, M voicemails, K stops.

**Tactics to copy:**
1. One 20-second viral beat, Gibberlink style: the gas veto mid-call ("I'm handing you to a pro").
2. AgentPay/NextWave's "agent proposes, code approves" proof panel.
3. A live number judges can call in the room.

## 7. Hard questions
- **"Isn't this OpenClaw with a phone skill?"** Use the two sentences in section 3.
- **"Google already calls shops."** "Google gathers quotes. It doesn't diagnose, gate safety, buy, call back or verify the fix."
- **"n=0 loss data."** "Correct. Pricing is simulated from eval runs. The pilot guarantee is capped at the part plus one visit."
- **"Not licensed for insurance."** "Phase 1 is a capped service guarantee. Phase 2 goes through a licensed carrier or MGA." The legal side is unverified.
- **"What if she misreads the meter?"** "Ambiguous readings never pass the gate. If we can't confirm, we escalate to a pro."

## Conflicts and unverified claims
- **Meadow:** the task says autonomous commerce, but reports found a restaurant secret-shopper company or only a tagline. Don't tailor claims to them.
- **Google's home-repair calling:** single-source.
- **OpenClaw:** missing voicemail detection is an absence of evidence. The 21K exposed-instances figure is unverified.
- **A2A v1.2 and AP2's handoff to FIDO:** single-source.
- **Don't say:** Visa/Mastercard integration, escrow, or "OpenClaw can't."