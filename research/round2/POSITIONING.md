## 1. Positioning

**"Assistants tell you how to fix it. Fixline gets the part on its way."** You call one number. It diagnoses the problem, checks whether the repair is safe, phones parts counters in parallel, and calls you back for a spoken "yes" to order.

| | Meta Ray-Ban | Grok | ChatGPT / Dots | Gemini Live | Google "Ask for Me" | Fixline |
|---|---|---|---|---|---|---|
| Diagnose | Y | Y | Y | Y | N | Y |
| **Calls parts distributors, closes on a spoken yes** | N | N (sells inbound agents) | N (1-800 is inbound only; Dots work on screens) | N | Partial: local shops/services, US, results by email or text | **Y** |
| **No smartphone, screen or $799 hardware** | N | N | Inbound only | N | N (starts in Search) | **Y** |
| **Safety gate, spend cap and audit log enforced in code** | N | N | Confirm rules, on screen | N | N | **Y** |

Sources: [Forklog](https://forklog.com/en/openai-introduces-phone-and-whatsapp-access-to-chatgpt/), [TNW](https://thenextweb.com/news/openai-dots-always-on-ai-agents-cloud-computers-devday), [SEJ](https://www.searchenginejournal.com/google-search-can-now-call-local-businesses-using-ai), [Bloomberg Law](https://news.bloomberglaw.com/artificial-intelligence/meta-launches-799-glasses-with-screen-and-ai-integration)

## 2. Framing: "one engine, two markets", sold to enterprise

- Consumers won't pay. The buyer is whoever pays for the repair.
- The judges reward enterprise stakes:
  - Conduit cares about voice.
  - Latted/Fume care about background agents with guardrails.
  - Meadow cares about agents that buy.
  - Corgi cares about the safety gate.
  - Transpose wants a market size.
- Use the AC in a heatwave as a 45-second emotional opener. The port is the company.
- **Add Dispatch: yes.** A fault-code event that triggers sourcing is "live data moving physical things."
- Submit to Dispatch and No App. A roughly 20-line killswitch also earns Unsupervised.

## 3. Top enterprise verticals

1. **Defense base facilities.** The Army created an HVAC task force on Oct 15, 2026, and Fort Hood once went 5–6 weeks without AC ([Defense News](https://www.defensenews.com/news/your-military/2026/10/15/acting-us-army-secretary-creates-task-force-for-hvac-repairs/)). A Guard maintainer calls about a seized barracks compressor, Fixline calls three distributors, and he says "yes" within minutes. These are commercial off-the-shelf (COTS) parts, so ITAR doesn't apply.
2. **Ports and yards.** An hour of ship-to-shore crane downtime costs an estimated $5k–$50k+ ([vendor brief](https://heavyvehicleinspection.com/fleet-management/uptime/ports-rail-uptime-executive-brief)). The Port of San Diego is buying 77 zero-emission units, first-generation gear that few techs know well ([Breakbulk](https://breakbulk.com/articles/port-of-san-diego-buys-zero-emission-cranes)). A fault on a terminal tractor triggers a call to the tech and parallel calls to parts counters, so the part arrives before the berth window.
3. **Multi-site restaurants and facilities.** One 800-location operator loses about $18M/yr to food-equipment downtime ([Vixxo](https://www.vixxo.com/facilities-management-news/food-equipment-downtime-costs-what-qsr-facilities-directors-should-track)). A shift manager with greasy hands calls about a dead fryer, Fixline sources the part, and the operator pays per resolved case.

## 4. Demo changes (about 3 hours)

**Person A (backend)**
- Add `POST /fault`, which takes a simulated Samsara `DeviceHasVehicleFault` J1939 payload. Fire it with `curl` on stage. Fixline then calls the tech outbound, and the safety gate refuses the high-voltage work and logs why. About 60 min.
- Place 3 Vapi calls in parallel with `Promise.all` to teammates or friends playing supply counters. Each call opens by saying it is an AI. About 45 min.
- Enforce guardrails in code: caps on calls, minutes and dollars, plus an approved-vendor list. On a breach, stop and call the user. About 20 min.

**Person B (a board for the audience only; the caller never sees a screen)**
- Three call lanes with live transcripts, and a quote table that highlights the cheapest identical part. About 60 min.
- A "parts graph" built on a SQLite `quotes` table, with a live row counter. Rerun the lookup to show a cached result in under a second. Pre-seed the model-to-part mapping and say on stage that it is seeded. About 30 min.
- Use a mock checkout. Spend no real money.

**Run order:** AC call, then port fault, then the board, then the callback and "yes."

**Cut first:** AIS ship data and proactive outreach.

**Also:** call 2 real San Diego supply houses to see whether they will quote an AI caller, and cite the result on stage.

## 5. Hardest judge questions

- **"Google already calls businesses."** It calls local services from Search and sends a summary. We call distributors by part number, from any phone, with a safety gate, and we close the order.
- **"Voice agents are a commodity."** The moat is the parts graph: model, cross-reference, price and stock per supplier. It starts thin, but every call makes the next lookup faster.
- **"Why trust an AI to spend money?"** Caps and vendor lists are enforced in code, not in the prompt. Nothing is ordered without a spoken yes. Every call is recorded with a transcript.
- **"Samsara or Konecranes already do this."** They stop at dashboards and work orders, and Konecranes only covers its own equipment ([Konecranes](https://investors.konecranes.com/press/asset-management-made-easy-digital-services-now-available-standard-all-konecranes-port-cranes)). Nobody phones the parts counter.
- **"Will suppliers talk to a bot?"** Answer with today's result from the 2 test calls.

## 6. Pitch (30 seconds)

"Meta glasses and ChatGPT tell you to check your capacitor. Then you're on hold with parts counters for two hours. Fixline is the agent that makes those calls. Call one number from any phone. It diagnoses the problem, refuses dangerous repairs, calls suppliers in parallel, and rings back: '$412, Tuesday, say yes.' The same engine fires when a port tractor throws a fault code at 4 a.m., before the ship docks. The Army created an HVAC task force nine days ago. We get the part on its way."

## Flags

- **Google timeline conflict:** one report puts the rollout at Jul 2025. Another has a Jan 2025 Labs test, retail calling in Nov 2025, and home repair announced May 2026 and still rolling out. Never say "Google can't call."
- **Negotiation is only partial.** Say "compares quotes," not "negotiates."
- **Defense:** the GAO and F-35 figures come from secondary coverage, and the CMMC date is disputed. Vapi and Twilio are not FedRAMP-authorized, so pitch installation facilities only. One report said there was no defense data, but the defense report contradicts that.
- **Vendor or dated numbers:** the port and restaurant downtime figures are vendor estimates. The 84% shop survey is from 2021–22.
- **Unconfirmed:** Meta "autonomous purchasing," Grok Voice 3.0, and whether the iOS 27 Siri has shipped.
- **Prior art:** a hackathon build already phones suppliers for parts ([Valtonen](https://fi.linkedin.com/in/oskari-valtonen)), and Workd sells voice parts lookup to HVAC distributors ([Workd](https://www.workd.com/industries/hvac/)). Differentiate on the full loop plus the safety gate.
- **Legal:** under FCC 24-17 an AI voice counts as "artificial," so disclose that the caller is an AI at the start of every call.
- **Unproven novelty:** that nobody joins AIS ship ETAs with equipment fault codes is an absence in search results, not proof.