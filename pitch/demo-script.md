# Fixie: 3-minute demo script

**Tracks:** **No App** (primary) + **Unsupervised** (+ **Dispatch** if the port beat ships and the organizers allow multi-track).
**Problem (1 line):** When a dryer breaks, the fix is usually a $17 part and 15 minutes. But finding the right part takes a screen, a search, and hours on hold, so people pay about $150 for a visit or live without it.
**Promise:** *Assistants tell you how to fix it. Fixie gets the part on its way, then walks you through installing it.*

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
| **0:00–0:10** | **Hook** | "Dorothy, 74. Her dryer won't heat. She never sees a screen. Friends are playing the parts counters tonight." | Empty board, OPERATOR AUDIT VIEW |
| **0:10–0:50** | **1. Live intake** | *(Dorothy says it all in one breath: dryer, no heat, model, 2019.)* "One readback of the model number, a safety gate (electric is DIY once unplugged, gas goes to a pro), and consent to call back on this number. She hangs up." | Dorothy lane · consent ✓✓ · Diagnosed · thermal fuse WP3392519 · DIY with caution |
| **0:50–1:30** | **2. Four calls at once** | "Now it works **on its own**. Warranty line: expired. PartsDirect reads back the part number, **$9.10 plus $3.95**. Valley says **$55 plus $4**: that's $59 landed, over her $40 cap, so the **guard skips it**. Coast doesn't pick up: **no-answer guard**, no retry. All in code, not the prompt." | 4 lanes side by side · **ticker:** "Valley quoted $59.00 landed. Over the $40 budget, skipped." · struck-through Valley row · PartsDirect **CHEAPEST $13.05** |
| **1:30–1:55** | **3. Callback + "order it"** | "Fixie calls the number that called in and says when she called, so it's not a scam call. Nothing is bought until she says the words." *(Dorothy: "Order it.")* | ORDERED pill · **$186.95 saved vs tech visit · $45.95 vs next-best** · budget $13.05 / $40 · Fixie's own spend meter |
| **1:55–2:35** | **4. Delivery + install** | *(Jianan presses **D**: a simulated UPS webhook.)* "Tuesday. The box lands, and Fixie calls **her** again." *(Dorothy: "It's unplugged, the vent's clear, the panel's off, I'm holding the fuse.")* "Two safety acks, so it skips ahead. Is it warm?" *(Dorothy: "It's warm!")* | Delivery banner · ✓ Unplugged ✓ Vent cleared · steps skipped · **FIXED** |
| **2:35–2:50** | **5. Port fault (simulated, labeled)** | *(Jianan presses **P**.)* "A simulated fleet-telematics webhook. A terminal tractor at the Port of San Diego throws SPN 3226. Same engine: it refuses the high-voltage and exhaust work and sources for the certified tech. Dorothy needs no screen; the tech needs no hands." | 🚨 YT-07 job tab · **SIMULATED** badge · Pro only |
| **2:50–3:00** | **Close** | "Two numbers: **$186.95** vs a tech visit, **$45.95** vs the next quote, same part number. Who pays: home-warranty companies, insurers, senior living, per resolved case. **Fixie gets the part on its way.**" | Click the 👵 Dorothy tab to return to the counters |

**If behind schedule:** shorten beat 4 to the one-breath acks and "It's warm!" Never cut the **guard ticker** or **"order it"**.
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
5. **3.1 billion people** live under mobile coverage but don't use mobile internet (GSMA). A phone call is the universal interface.

*Enterprise backups:*
- The **Army created an HVAC repair task force on Oct 15, 2026** (Defense News).
- The **Port of San Diego** is buying **77 zero-emission units** (Breakbulk).
- Port crane downtime is estimated at **$5k–$50k+ per hour**. That's a vendor estimate, so call it an estimate.

*Avoid:* the "22% of seniors have no smartphone" stat (secondary source only), "negotiates" (say "compares quotes"), and "Google can't call businesses."

---

## 30-second pitch (dryer version)
> "Meta glasses and ChatGPT will tell you to check your dryer's thermal fuse. Then you're on hold with parts counters, on a screen, for an afternoon. **Fixie is the agent that makes those calls.** Call one number from any phone. It diagnoses by voice, refuses dangerous repairs, checks your warranty, calls suppliers in parallel for the identical part, and rings back: *'Thirteen dollars delivered, arriving Tuesday. Say "order it".'* When the box lands, it calls again and walks you through the install. The same engine fires when a port tractor throws a fault code at 4 a.m., before the ship docks. **Fixie gets the part on its way.**"

---

## Hard Q&A (one breath each)

**"Google already calls businesses."**
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
