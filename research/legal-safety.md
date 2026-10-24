## Legal and safety constraints for the open-repair voice agent

I ran about 9 web searches and fetched one EPA page, which is the only primary source I read directly. Everything else comes from law-firm, trade and vendor pages. Items marked **[unverified]** need a check against the statute. This is not legal advice.

### 1. Legal picture

**FCC Feb 2024 TCPA ruling**
- On Feb 8, 2024 the FCC unanimously ruled that AI-generated voices are "artificial" under the TCPA. It took effect immediately. It clarified existing rules rather than creating new ones. ([Cooley](https://www.cooley.com/news/insight/2024/2024-02-15-fcc-ai-generated-robocalls-illegal-under-the-tcpa), [Akin](https://www.akingump.com/en/insights/ai-law-and-regulation-tracker/fcc-issues-declaratory-ruling-on-ai-generated-voice-robocalls))
- Consent is the core requirement. Calls to residential landlines and cell phones need prior express consent unless an exemption applies. ([Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2024/02/fcc-declares-authority-and-intent-to-regulate-ai-generated-calls-under-the-tcpa))
- **Calls to businesses:**
  - The artificial-voice rule for landlines, 47 USC 227(b)(1)(B), covers only "residential" lines. Business landlines appear to be outside it. ([Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2024/02/fcc-declares-authority-and-intent-to-regulate-ai-generated-calls-under-the-tcpa), [Manatt](https://manatt.com/insights/newsletters/tcpa-connect/use-of-artificial-intelligence-in-calling-activity))
  - The primary-source holding is **[unverified]**.
  - Cell phones are covered separately, in 227(b)(1)(A)(iii). A small shop whose listed number is a mobile is therefore at risk.
  - Our calls are non-marketing and informational: price and availability quotes, with an order only after the user approves. That is a much lower-risk category than telemarketing.
  - Mitigations: prefer published business landlines, identify the caller and a callback number, and honor "stop calling" immediately.
- The FCC's Aug 2024 NPRM proposed a clear AI disclosure at the start of each outbound AI call, plus consent. I found no final order **[unverified]**. Disclosing up front anyway makes us compliant if it is adopted. ([Brownstein](https://www.bhfs.com/insight/fcc-proposes-new-ai-generated-robocall-rules/), [Manatt](https://www.manatt.com/insights/newsletters/tcpa-connect/fcc-proposes-ai-regulations))

**California AI disclosure**
- SB 1001 (2018) bars undisclosed bots that try to influence a purchase or a vote. It is described as aimed at online communication, so it may not cover phone calls. ([Financier Worldwide](https://www.financierworldwide.com/bot-or-not-navigating-californias-bot-disclosure-law))
- AB 2905 amends Public Utilities Code §2874. It was reportedly signed Sept 20, 2024 (Ch. 316). The natural-voice announcement before a prerecorded or ADAD call must say whether the message used AI or an artificial voice. ([committee analysis](https://apcp.assembly.ca.gov/system/files/2024-04/ab-2905-low-apcp-analysis.pdf), [§2874 text](https://law.justia.com/codes/california/code-puc/division-1/part-2/chapter-10/article-1/section-2874))
- Some vendor guides overstate AB 2905's reach. Treat the exact scope and effective date as **[unverified]**.
- I found no 2025-26 California statute that clearly adds a phone-call disclosure rule.
- Conclusion: always say "I'm an AI assistant" in the first sentence of every call. It costs nothing and covers the proposed FCC rule, AB 2905 and SB 1001.

**California recording consent (Penal Code 632 / 632.7)**
- California is an all-party consent state. Section 632 covers confidential communications, and §632.7 covers calls involving cell or cordless phones. The California Supreme Court held that §632.7 reaches both parties and third parties. ([PII summary](https://www.pii.ai/blog/cipa-632-7-mobile-sms-phone))
- A CIPA class action against an AI call-handling vendor survived a motion to dismiss. That was a pleading-stage ruling. ([WSGR](https://www.wsgr.com/en/insights/us-federal-court-allows-cipa-class-action-against-ai-customer-service-provider-to-proceed.html))
- Penalty figures vary by source, so check the statute.
- Compliance:
  - Announce the recording at the very start of every call, to the senior and to the business.
  - Record only after consent. If the business says no, continue the call without recording and keep text notes only.
  - Using a third-party transcription vendor adds wiretap-style exposure, so list that vendor in the disclosure.

**Right to repair and warranty**
- California SB 244 took effect July 1, 2024. Manufacturers must provide parts, tools and documentation to owners and independent repairers on fair terms. ([Sidley](https://www.sidley.com/en/insights/newsupdates/2023/10/california-becomes-third-us-state-to-join-the-right-to-repair-movement), [StopWaste](https://www.stopwaste.org/resource/californias-new-right-repair-law-january-2024))
  - It covers products sold in California on or after July 1, 2021.
  - The required availability window is 3 years for products priced $50-$99.99 and 7 years for products priced $100 or more.
  - Enforcement is by cities, counties and the state.
  - Several sources describe it as covering electronics and appliances, but the coverage of appliances like AC units and mowers is **[unverified]**.
  - Our pitch: the agent cites this right when asking an OEM for a part.
- Under Magnuson-Moss, the FTC says a warrantor cannot void a warranty just because the owner used third-party parts or an independent repairer. "Warranty void if removed" stickers are generally unlawful. A warrantor can still deny coverage for damage that the repair actually caused. ([FTC](https://www.ftc.gov/node/54283), [TechCrunch](https://techcrunch.com/2018/04/11/ftc-warns-companies-that-void-warranties-over-using-3rd-party-services/))
- Script line: "If it's still under warranty, call the maker first. A repair you do yourself won't automatically void it, but damage you cause might not be covered."

**Refrigerant (EPA Section 608)**
- The venting ban in 40 CFR 82 Subpart F applies to anyone servicing or repairing AC or refrigeration equipment, not just professionals. ([EPA](https://www.epa.gov/section608/prohibition-venting-refrigerants), updated Dec 2025)
- Sales of CFC, HCFC and HFC refrigerants are restricted to certified technicians. The exception is small R-134a cans for car AC. ([EPA 608 distributor fact sheet](https://19january2017snapshot.epa.gov/sites/production/files/2016-09/documents/608_fact_sheet_distributors_and_wholesalers_0.pdf))
- Therefore, **any task that opens the refrigerant circuit is an automatic escalation to a pro.** That includes recharging, topping off, and replacing a compressor, coil or line set.
- The agent must never help a user buy refrigerant. Purchases are limited to certified technicians.

**Electrical and gas hazards**
- AC run and start capacitors can hold a lethal charge long after power is off. Guides advise verifying with a meter and discharging through a resistor, never a screwdriver short. ([PickHVAC](https://www.pickhvac.com/central-air-conditioner/troubleshoot/discharge-capacitor-before-replacing/)) Microwave capacitors can hold 2,000-4,000 V, so never guide a DIY microwave repair.
- Source quality on capacitor safety is poor: the results were mostly SEO pages. For the demo, the safe design is to escalate any capacitor work rather than coach it.

### 2. Safety guardrails spec

**Tier A: allow DIY by voice.** The user must confirm the unit is unplugged or the breaker is off.
- Clean or replace a filter.
- Clear a clogged condensate line or drain.
- Clean mower blades and spark plugs, replace an air filter, swap a mower blade (spark plug wire off, fuel off).
- Replace a fridge door gasket or a dishwasher or washer hose filter.
- Reset a tripped breaker once, or a GFCI.
- Replace a thermostat battery.

**Tier B: coached only with a safety checkpoint.** Make the user say "confirmed" aloud at each step.
- Replace a water-heater element (breaker off, tested dead).
- Replace a dryer belt or heating element.
- Swap a small appliance part, such as a door switch, with the unit unplugged.

**Tier C: hard escalate.** Do not coach. Offer a licensed pro and a call to book one.
- Anything touching refrigerant.
- Capacitor, contactor or compressor work.
- Gas appliance parts: valves, burners, pilots, lines. If the user smells gas, say "leave the house, don't touch switches, call 911 or the gas company" and end the diagnosis.
- Microwave interior.
- Any sparking, burning smell or smoke.
- The user says they feel unsafe, dizzy or confused, or sounds cognitively impaired. Hand off to a family contact or 911 as appropriate.

**Scripted disclosures (first 10 seconds):**
- To the senior (inbound): "Hi, this is an AI assistant that helps with repairs. This call may be recorded and transcribed so I can help you. Is that okay? I'm not a licensed technician. For anything involving gas, refrigerant or electrical panels, I'll send you to a professional."
- To a business (outbound): "Hello, this is an AI assistant calling on behalf of [customer first name] to ask about a part price and availability. This call is recorded for accuracy. Is that okay? You can ask me to stop calling at any time. Callback: [number]." If they say no to recording, continue without it.
- Never claim to be human, and never withhold the AI disclosure if asked.

**Payments and authority:**
- Quotes only until the user says "yes, order it" aloud. The agent reads back item, total, shipping and seller, then takes a spoken confirmation.
- Cap at $100 per order by default, or the user's stated limit. Any spend above the cap needs fresh consent.
- Use a single-use virtual card with a hard limit. The agent never reads out or stores the user's full card number.
- Keep an audit trail: transcript, the quotes obtained, and what the user approved.

### 3. Mapping to the Unsupervised track

| Failure | Detection | Stop action |
|---|---|---|
| Looping | Same question asked 3 times, same vendor called twice, or a repeated transcript n-gram | Break the loop and move to the next vendor, or escalate |
| Stuck | No new quote after 8 calls, a call over 6 minutes, or an IVR maze beyond 2 menu hops | Hang up and log |
| Overspending | Telephony and LLM spend above an $X ceiling, or order total above the cap | Freeze and call the user for approval |
| Wrong item | Part number mismatch or confidence below a threshold | Ask the user or a pro to verify |
| Time | Overall job past 45 minutes | Report the best result so far and stop |
| Safety | A Tier C keyword appears | Stop everything and escalate |
| Hostile or opt-out | "Stop calling" or "remove me" | Add to a do-not-call list and never retry |

- The ending call to the user should say what was done, what it cost and why it stopped. For the demo, show a live budget meter and one deliberate stop, for example a vendor stuck in an IVR.
- Add a kill switch, a per-vendor retry cap of 2, and calls only during business hours.

### Gaps to verify
These are the items to check before relying on any of the above:
- The FCC docket status.
- AB 2905's chaptered text.
- Whether SB 244 covers HVAC units and mowers.
- Business-landline TCPA treatment.