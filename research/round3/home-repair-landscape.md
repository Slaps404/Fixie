**Home and appliance repair landscape, Oct 2026**

This is from about 10 minutes of search. I treat anything marked unverified as a lead, not a fact.

**Who does what**

| Capability | Who | Evidence |
|---|---|---|
| Remote diagnosis (human-led video) | Frontdoor/AHS via Streem (AR and computer vision for pros). A technician sees the item through the homeowner's phone. | [Pulse2](https://pulse2.com/why-frontdoor-is-buying-streem/). Streem claims video can avoid repeat visits on up to 70% of calls, but that is a vendor figure. I found no confirmed 2026 AI-agent diagnosis launch from Frontdoor. It reports about 3.8M service requests and 17,000 contractors ([Q2 2026](https://www.businesswire.com/news/home/20260806404443/en/Frontdoor-Reports-Second-Quarter-2026-Results)). |
| Remote diagnosis (automated, appliance-native) | Samsung SmartThings Home Care and AI Pre-Care. It predicts failures across 10 appliance types and offers a repair reservation. The 2026 version is an India AC launch. LG ThinQ Care claims to predict faults from diagnostic data. | [Sammobile](https://www.sammobile.com/news/samsung-predict-home-appliance-break-down-ai-pre-care-notification-subscription-club/), [FoneArena](https://www.fonearena.com/blog/475193/samsung-india-smartthings-home-care-2026-bespoke-ai-ac.html), [GadgetGuy](https://www.gadgetguy.com.au/ifa-2025-lg-thinq-ai-smart-home-updates). Both work only on the brand's own connected appliances, and both end in "book our technician." I found no accuracy data. |
| Remote diagnosis (OEM chatbot) | GE SmartHQ has a "SmartHQ Assistant," a diagnostics tool, proactive service alerts and scheduling. It needs a connected model. | [App Store](https://apps.apple.com/app/id992883749). Whether it uses generative AI is unverified. |
| Remote diagnosis (parts retailer) | PartSelect "Instant Repairman" diagnoses, names the part and walks through the repair. | Described only on a third-party page ([autotouch](https://www.autotouch.ai/prospecting/partselectcom)). Treat as unverified. No sign of a voice interface. |
| Sources parts | Mainly retailers (PartSelect, RepairClinic) as websites. I found no incumbent that calls suppliers to compare live price and stock for an identical part. | Absence of evidence from my searches. |
| Calls the homeowner proactively | Angi "AI Front Desk" (beta, July 2026) calls homeowners on behalf of pros to book appointments. About 80% of pros who enabled it kept it on. Angi says its homeowner funnel is becoming an "AI homeowner agent." | [Angi Q2 2026 letter](https://ir.angi.com/node/12691/pdf). This is a lead-follow-up caller for the pro. It doesn't diagnose or source parts. |
| Proactive alerts to the homeowner | Samsung and LG (app or notification). Insurers push sensors: Whisker Labs Ting (State Farm-backed, over 100K homes), Moen Flo with Farmers and Stand, and Frontdoor's Moen Flo deal. | [State Farm](https://newsroom.statefarm.com/whisker-labs/), [Coverager](https://coverager.com/stand-and-moen-launch-smart-water-leak-program-with-insurance-discounts/), [TipRanks](https://www.tipranks.com/news/the-fly/frontdoor-expands-agreement-with-moen-to-six-additional-states). These cover water and electrical fire, not appliance repair. Moen's "96% fewer claims" figure is a vendor claim. |
| Consumer AI intake | Thumbtack's April 2026 AI experience takes text, photo or voice and matches local pros. I found no outbound calling. | [BusinessWire](https://www.businesswire.com/news/home/20260430186888/en/Thumbtack-Introduces-AI-Powered-Experience-to-Reinvent-How-Homeowners-Care-for-Their-Homes) |
| Tech-side AI | Aquant Service Co-Pilot and Vision AI (early access). It started with a $50/month appliance triage app in 2022 and has raised about $110M (third-party figure). | [Aquant](https://aquant.ai/) |
| Warranty and protection | Asurion is buying Domestic & General (announced Dec 2025, close expected mid-2026, closing unconfirmed). It pitches itself as "CTO of the home," with predictive diagnostics and AI service. | [Asurion](https://asurion.com/press-releases/asurion-acquires-domestic-and-general/) |

**Not found:** I found no 2026 AI material for Puls (last coverage is [2021](https://techcrunch.com/2021/11/11/puls-technologies-on-demand-home-repair-service/)), Choice Home Warranty, HomeAdvisor, Assurant, Centriq, HomeZada, Dwelly, Hippo, Kangaroo, XOi, Dave's AI or FieldCamp. That means unverified, not absent. One March 2026 customer review blames Sears Home Services' "AI phone program" for having no live agent ([review page](https://www.searshomeservices.com/repair/reviews?page=823)). That is anecdotal. It does show the customer cost of a bad automated phone experience.

**Overlap with Fixie**

- Diagnosis overlaps most with Streem (human-led), Samsung and LG (own-brand only), and PartSelect (web).
- Proactive calling overlaps with Angi (pro-side booking only).
- Nobody I found combines all four of these: brand-agnostic diagnosis, a safety gate, live multi-supplier part sourcing by phone, and guided install.
- Frontdoor and Asurion monetize the technician visit or the warranty claim. A $9 do-it-yourself fix works against that revenue. That is a reason for them to partner or buy, and also why they are unlikely to build it.
- A general agent such as OpenClaw can place calls. The incumbent data above is closed: appliance telemetry, a warranty network, a contractor network. Fixie's defensible edge is the repair-specific workflow plus the guardrails, not the phone calling.

**Three white spaces**

1. **Brand-agnostic "fix or fix-it-yourself" triage ahead of the dispatch decision.** The pitch is to cut avoidable truck rolls (a visit that a $9 part would have prevented).
   - Buyers or partners: Frontdoor/AHS (cost per service request, a Streem upgrade), Asurion and Domestic & General, Choice and other warranty carriers.
   - Caveat: this threatens their own visit revenue, so the pitch is a claims-cost reduction, not a replacement.

2. **Live parts-sourcing agent that phones suppliers, with identical-part verification.** Nobody found does this. Retailers only offer a catalog. The proof point is the quote ranking and the vendor allowlist.
   - Buyers or partners: PartSelect and RepairClinic (as a supplier channel), Whirlpool and GE (OEM parts), Aquant (the same capability for technicians).
   - Also: the same engine fits enterprise fault-to-parts flows such as the J1939 terminal tractor beat.

3. **Event-driven proactive voice for people who don't use apps.** Samsung and LG push app notifications to people who own connected appliances. Fixie would handle older, unconnected appliances and the elderly, with a voice call (Dorothy, 74).
   - Buyers or partners: insurers and Ting or Flo-style sensor programs (Whisker Labs, Moen, Farmers, State Farm, Stand), plus Samsung and LG as a voice and service channel.
   - A sensor event turns into a call, a diagnosis and a sourced part. Today those insurer programs end at the alert.

**Claims to avoid**

- Don't say nobody calls businesses with AI. Google AI Mode does call local businesses, and Angi's agent already calls homeowners.
- Don't say nobody diagnoses remotely. Streem and Samsung do.
- Say instead: "No one combines safety-gated diagnosis, live multi-vendor parts sourcing by phone and guided install, brand-agnostic and by voice." That statement is true only as far as my search coverage goes, so soften it to "we found no one."