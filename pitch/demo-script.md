# Fixie: 3-minute demo script

**Tracks:** **No App** (primary) + **Unsupervised** (+ **Dispatch** if the port beat ships and the organizers allow multi-track).
**Problem (1 line):** When a dryer breaks, the fix is usually a ~$13 part and 15 minutes. But getting there takes a screen, a search, and hours on hold, so people pay up to $200 for a visit or live without it.
**Positioning (issue #14): concede the plumbing, claim the loop.**
- **Concede:** OpenClaw, Google AI Mode, Gemini "Call for Me", and Meta Muse can all call businesses. **Calling is plumbing.** Never say "OpenClaw can't."
- **Claim:**
  - one number from any phone, no app
  - a diagnosis by **tests**, with a probability bar that moves
  - a hard safety gate
  - parallel sourcing of the **identical part**
  - a spoken "order it"
  - a delivery call, a guided install, and a **verified fix**
  - every spend and call limit **enforced in code**
- **Bigger story:** *"Fixed, or we pay the pro."* The maintenance department for homes that don't have one. Every callback-verified fix is outcome data that prices the next guarantee. Say **"simulated pricing"**; it is not underwriting.
- **Last line on stage:** ***"The order is mocked; the caps are real code."***

## Roles on stage
- **Presenter** (Lane B): narrates and points at the board.
- **Jianan** (Dorothy): speaks through a speaker puck or headset into the PA, never a speakerphone. Also runs the laptop hotkeys: `D` = delivery webhook, `P` = port fault, `X` = kill switch (Q&A only).
- **Role-play phones:** warranty, PartsDirect (front row, audible), Valley ($55 + $4 → budget guard), Coast (declines → no-answer guard). See `roleplay-scripts.md`.
- **Board:** `node web/serve.mjs` → `localhost:8080`. The header reads **OPERATOR AUDIT VIEW**. **Dorothy never sees a screen.**
- **Fallback ladder** (one operator calls it, no debate): L1 flip a dead lane to sim → L2 suppliers to sim → L3 all sim (the board shows the SIMULATED badge) → L4 backup video, or `?replay=1` of rehearsal logs.

---

## Run order (hard 3:00)

| Time | Beat | Say (presenter) | Board shows |
|---|---|---|---|
| **0:00–0:10** | **Hook** | "Any agent can make a phone call now. Calling is plumbing. Dorothy is 74, her dryer won't heat, and she never sees a screen. Watch what happens *around* the calls. Friends are playing the parts counters tonight." | Empty board, OPERATOR AUDIT VIEW |
| **0:10–0:55** | **1. Live intake + diagnosis by test** | *(Dorothy: dryer, no heat, model, 2019. Then she answers the tests.)* "It doesn't guess. Breakers on, drum turns, no warmth at all. Then, **dryer unplugged**, she touches the meter to the fuse: silent. Watch the bar: **P(thermal fuse) 0.51 → 0.98**. The likelihoods are expert-written, not learned; every confirmed fix tunes them. Gas would go straight to a pro." | **Probability bars move** with a reason line · consent ✓✓ · thermal fuse WP3392519 · DIY with caution |
| **0:55–1:30** | **2. Four calls at once: agent proposes, code approves** | "She hangs up, and Fixie works **on its own**. Warranty: expired. PartsDirect reads back the part number, $9.10 plus $3.95. Valley proposes $59 landed, and **code blocks it**: over her $40 cap. Coast doesn't answer, so it's skipped with no retry. Look at the decision log: every proposal, ✅ or ⛔, with the rule that decided it." | 4 lanes · ticker: *"Valley quoted $59.00 landed. Over the $40 budget, skipped."* · decision log ⛔/✅ rows · strip: **calls 4/8 · parallel vs serial · guards fired 2** |
| **1:30–1:50** | **3. Callback + "order it"** | "It calls back the number that called in. It names the price and the day, nothing she has to parse. Money moves only on her words." *(Dorothy: "Order it." Fixie: "Done, I ordered the part… anything else?" Dorothy: "No, that's all.")* | Decision log row: ✅ **🗣 DOROTHY** "Spoken 'order it'" · **$186.95 vs tech visit · $45.95 vs next-best** · $13.05 / $40 committed |
| **1:50–2:30** | **4. Delivery + install + verified fix** | *(Jianan presses **D**: a simulated UPS webhook.)* "Tuesday. The box lands, and Fixie calls **her**." *(Dorothy: "It's unplugged, the vent's clear, the panel's off, I'm holding the fuse.")* "Two safety acks, enforced server-side. Is it warm?" *(Dorothy: "It's warm!")* "**That callback is the data a guarantee is priced on.**" | Install banner · ✓ Unplugged ✓ Vent cleared · **FIXED** |
| **2:30–2:45** | **5. Port fault (simulated, labeled)** | *(Jianan presses **P**.)* "A simulated telematics webhook. A port tractor throws SPN 3226. Same engine; it refuses the high-voltage and exhaust work and sources for the certified tech." | 🚨 YT-07 tab · **SIMULATED** · Pro only |
| **2:45–3:00** | **Close** | "Any agent can make the call. **Fixie closes the loop and stands behind the result**: fixed, or we pay the pro, at simulated pricing today. 75% of adults over 50 want to age in place; this is the maintenance department for their homes. **The order is mocked; the caps are real code.**" | Back to the 👵 Dorothy tab: both counters, decision log |

*Optional runaway beat (only if time and a 5th "Hold Forever" actor exist):* Hold answers and goes silent → stuck guard trips → presenter presses **X** (kill switch) live → STOPPED pill, and every live call ends. Otherwise keep `X` for Q&A.

**If behind schedule:** drop the port beat first, then shorten beat 4 to the one-breath acks and "It's warm!" Never cut the **probability bar**, the **decision log ⛔ row**, or **"order it"**.
**If a live leg fails:** don't debug on stage. Go down the fallback ladder, and say "this leg is simulated; the badge says so."

## Track talking points (weave into beats 2–4)

**No App**
- The user's interface is the **phone they already own**: any phone, including a landline or flip phone.
- The model number is read aloud with a digit-by-digit read-back. No photo is required.
- The confirmation is a **spoken yes**. The install is a **voice walkthrough** with a spoken check ("is it warm?").

**Unsupervised**
- After Dorothy hangs up, Fixie runs for **days** on its own: warranty → parallel quotes → callback → waits for delivery → calls back to install.
- **Guardrails enforced in code, not in the prompt:**
  - caps on **calls**, **minutes**, and **dollars**
  - an **approved-vendor allow-list**
  - **voicemail / loop / stuck** detection → hang up, log, move on
  - when a cap trips → **stop and call the human**
- **Knows when to stop:** a spoken yes is required before any spend, Tier-C hazards go to a pro, and the job ends at a verified fix.

## Safety talking points (for Corgi / Conduit judges)
- **Safety tiers:**
  - **DIY:** unplugged electric dryer fuse, with a spoken "unplugged" checkpoint before step 2.
  - **Pro only:** gas, refrigerant (EPA 608), capacitors and high voltage, smoke or burning smell. "Smell gas? Leave the house and call 911."
- **Every call opens with** "I'm an AI assistant; this call is recorded." That covers FCC 24-17 (AI voice = "artificial") and California's all-party recording consent.
- **Root cause, not just the part:** a blown fuse means a clogged vent, and Fixie tells her to clean it. Dryer fires run **about 2,900 a year** in the US; **failure to clean is the leading cause** (USFA).
- **Money:** quotes only until a spoken yes, a per-job $ cap, a mock checkout today, and a full transcript audit trail.

---

## 5 stats (say only these; sources in `part-prices.md` / `research/PLAN.md`)
1. **$100–$200:** a dryer repair visit (Fixr average $150; San Diego service calls alone run $65–$150). The part plus shipping was **$13.05**.
2. **2.1x:** the same Whirlpool part number, WP3392519, costs **$16.95** at one real seller and **$35.56** at another. *(Tonight's $9.10 / $55 quotes are role-play numbers.)*
3. **$3.0 billion:** fraud losses reported by adults 60+ in 2025, 5x 2020 (FTC). A known, fair price is the opposite of an upsell.
4. **About 2,900 home dryer fires a year**; failure to clean is the leading cause (U.S. Fire Administration).
5. **75% of adults 50+ want to age in place** ([AARP, Dec 2024](https://www.aarp.org/press/releases/2024-12-10-new-aarp-report-majority-adults-50-plus-age-place-policies-communities-catch-up.html)). Their homes have no maintenance department. *(Don't use the unverified "50M homes".)*

*Enterprise backups:*
- The **Army created an HVAC repair task force on Oct 15, 2026** (Defense News).
- The **Port of San Diego** is buying **77 zero-emission units** (Breakbulk).
- Port crane downtime is estimated at **$5k–$50k+ per hour**. That's a vendor estimate, so call it an estimate.

*Avoid:* the "22% of seniors have no smartphone" stat (secondary source only), "negotiates" (say "compares quotes"), and "Google can't call businesses."

---

## 30-second pitch (issue #14 version)
> "Dorothy's 74, and her dryer won't heat. A tech visit runs up to $200; the fix is a thirteen-dollar fuse. She calls one number, no app. Fixie tests the fuse with her by voice, refuses anything involving gas, phones the suppliers in parallel, and orders on her spoken 'order it', within limits its own code enforces. When the part arrives, it calls her, walks her through the install, and confirms the heat is back. Every confirmed fix becomes data that lets us guarantee the next one. **Any agent can make a phone call. Fixie closes the loop and stands behind the result.** The same engine runs port tractors."

**Two sentences for "isn't this OpenClaw with a phone skill?":**
> "Yes, OpenClaw can place these calls, and we'd use it as a commodity layer. What a personal agent won't do is take a call from a 74-year-old with a flip phone, refuse the gas repair, enforce spend limits it can't override, and call back to check the fix worked. That check is the data that lets us guarantee the repair."

## Hard Q&A (one breath each)

**"Isn't this just OpenClaw with a phone skill?"**
The two sentences above. Then point at the probability bar and the decision log: "The model proposes; deterministic code approves."

**"Google already calls shops."**
"Google gathers quotes. It doesn't diagnose, gate safety, buy, call back, or verify the fix."

**"You have zero loss data. How can you guarantee anything?"**
"Correct, n = 0 today. Pricing is simulated from eval runs, and the pilot guarantee is capped at the part plus one visit."

**"You're not licensed to sell insurance."**
"Phase 1 is a capped service guarantee, not insurance. Phase 2 goes through a licensed carrier or MGA." *(The legal details are unverified; don't go deeper.)*

**"What if she misreads the meter?"**
"Ambiguous readings never pass the gate. Two unknowns and we escalate to a pro."

**"Google already calls businesses." (long form)**
It does: local services, from Search, with results by text or email. We call **distributors by part number**, from **any phone**, with a **safety gate** and a **spoken-yes order**, and we **follow through to the install**.

**"Voice agents are a commodity."**
The agent is the commodity. The moat is the **parts graph**: model → part number → cross-refs → price and stock per counter. It starts thin, and every call makes the next lookup faster and cheaper.

**"Why trust an AI to spend money?"**
Caps and the vendor allow-list are **enforced in code**, not the prompt. **Nothing is ordered without a spoken yes.** Every call is recorded and transcribed. Today the checkout is mocked; no real money moves. *(Press `X` to show the kill switch: it ends every live call and marks the job STOPPED.)*

**"What if the diagnosis is wrong?"**
It asks a confirm-or-rule-out question first ("Electric or gas? Drum turns?"). It **verifies the fix by voice** at the end. If it's still cold, it escalates to an install-only pro, and a $13 part is the cheapest wrong guess in the house.

**"Isn't DIY dangerous for a 74-year-old?"**
That's why there's a gate. This repair is unplug-and-swap, rated "Easy," about 10 minutes. Gas, refrigerant, high voltage, or a user who sounds confused → **pro or family contact**, never DIY.

**"Will real suppliers talk to a bot?"**
→ *Use today's result from `lane-b-checklist.md` §5.* If no test was done: "It discloses up front, asks two questions, and takes 20 seconds. Workd already sells voice parts lookup to HVAC distributors, so the counters are used to it."

**"Were those suppliers staged?"**
"Yes. Friends played the counters so we don't cold-call real businesses at a hackathon, and the prices are role-play numbers. The calls, the quote extraction, the part-number check, the ranking, and the guards are all live." *(Say it in the hook, before Punn asks.)*

**"What stops it from running up a bill?"**
Caps on calls, minutes, and Fixie's own spend, all on the board. Plus the kill switch (`X`).

**"Samsara / Konecranes already do this for fleets."**
They stop at dashboards and work orders, and Konecranes covers only its own equipment. **Nobody phones the parts counter.**

**"Who pays?"**
Consumers won't pay much. The buyer is **whoever pays for the repair**: home warranty companies and insurers (B2B2C, per resolved case), fleet and port operators, and base facilities. An affiliate cut on parts covers the consumer line.

**"What's the market?"**
Every broken physical asset with a part number. Start with appliances (huge volume, simple parts), then fleets, ports, restaurant equipment, and base HVAC: one engine.

**"Is this really 'Unsupervised'?"**
The job spans days. The agent decides whom to call, runs calls in parallel, detects voicemail, loops, and stalls, stops at hard caps, and **calls the human when it stops**. The board is only for judges.
