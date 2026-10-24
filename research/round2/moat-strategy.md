## Stress test (YC partner voice)
Meta glasses, Grok, Gemini Live and ChatGPT voice all **answer**. Meta's latest update adds camera-aware answers and glanceable weather, stocks and calendar ([tech2](https://www.tech2.com/tech2/meta-ray-ban-display-glasses-get-a-long-awaited-ai-upgrade-plus-threads-and-better-cameras-text-10240578.html)). The Display glasses cost $799 ([CO/AI](https://getcoai.com/news/metas-799-ray-ban-display-glasses-add-screens-to-smart-eyewear/)). None of them is shown here placing a call to a parts counter, waiting on hold, or buying. Google "Ask for Me" already calls local businesses for price and availability ([TechCrunch](https://techcrunch.com/2025/07/16/google-rolls-out-ai-powered-business-calling-feature-brings-gemini-2-5-pro-to-ai-mode)). But it covers services like oil changes and nail salons, and it is not a parts-matching, order-closing, buyer-side agent. Expect "Google will do that." Enterprise parts-sourcing AI exists too, such as AAR's Airvoyant for airlines, built on Aeroxchange's network of 5,000+ suppliers ([Aviation Business News](https://www.aviationbusinessnews.com/mro/latest-news-mro/mro-americas-aar-targets-parts-sourcing-with-ai-powered-airvoyant-platform/)). That is software for procurement teams, not a phone line for whoever is standing at the broken machine.

## Candidate positionings
1. **Answer vs. outcome (a).** "Assistants tell you how to fix it. Fixline gets the part on its way." The delivered result is an order confirmation, not advice. Strongest for a demo and easy to defend. Weakness: Google could copy it.
2. **Parts graph, "Waze for parts" (b).** Every supplier call writes model, BOM, cross-reference, price, stock and timestamp into a graph. Each call makes the next one cheaper and faster. This is the long-term moat. It does not show in a 3-minute demo unless you stage it (see below).
3. **Asset memory and proactive calls (c).** "It calls you before the AC dies": a heatwave forecast plus your unit's age triggers an outbound call. This beats passive assistants but needs history you don't have today. Use it as a closing beat.
4. **Fiduciary buyer-side agent (e).** "The only agent that works for the person paying." It makes identical-spec comparisons, refuses upsells and checks counterfeits. It is a good trust story for judges from Corgi (insurance) and Meadow (commerce), but it is hard to prove on stage.
5. **Wedge plus enterprise MRO (f).** The consumer call is the wedge. The same engine then serves crews at ports, fleets and defense depots, where the person with greasy hands has a radio or a phone, not a laptop. That is the answer to "why is this a company."

## Pick this one-liner
**"Fixline is the agent that makes the phone calls. When something breaks, you call one number and it finds the exact part, at the best price, and orders it."**

Ranking: (a) is the headline and (b) is the reason it compounds. Pitch (f) as the market and (d) as the access story: it works from any landline, flip phone or radio patch, with no $799 hardware. Cite (c) and (e) as roadmap. Don't lead with a list of five features.

## 3-minute demo (about 3 hours of build)
- **0:00-0:20, Setup.** Show a dead AC. Say that Meta glasses and Grok would say "check your capacitor." Then dial Fixline from a flip phone or landline on speaker. The audience should see no screen.
- **0:20-1:10, Live inbound call.** Fixline diagnoses, takes the model number by voice, and runs the safety gate. If the repair is dangerous (gas, 240V), it refuses and escalates to a pro. Judges remember a refusal.
- **1:10-2:10, Outbound calls.** Hang up. Show a live terminal with a call feed. Fixline places 2-3 real calls, to teammates' phones playing suppliers. It reads the same spec each time and uses the best quote from the previous call as leverage. This follows the pattern one builder showed at an earlier hackathon ([Valtonen](https://fi.linkedin.com/in/oskari-valtonen)). Show hold-waiting, then a quote table.
- **2:10-2:40, Callback.** The phone rings with the cheapest identical part, the price and the ETA. You say "yes" and the order is placed with a mock or sandbox checkout. Do not spend real money.
- **2:40-3:00, Moat and market.** Show the parts-graph row count growing after the calls. Show a second scenario, "forklift hydraulic hose, port yard," running on the same engine with only the config changed.

**Cut list if time runs out:** skip proactive outreach and the real order. Keep the safety gate, the live outbound calls and the callback.

**Pre-seed the graph.** Cache the model-to-part mapping for the demo unit so a bad lookup can't sink the demo. Be honest that it is seeded, but make the writes of fresh call results live.

**Cost:** Vapi is roughly $0.05/min as a platform fee, and about $0.07-0.31/min all-in with telephony, STT, LLM and TTS ([Zeeg](https://zeeg.me/en/blog/post/vapi-ai-pricing), [Cekura](https://www.cekura.ai/blogs/vapi-ai-pricing)). Those are third-party estimates, so expect a few dollars per full demo run.

**Track fit:** Dispatch (calls to move physical things), No App (voice only), and Unsupervised (add a stuck/loop/overspend killswitch: cap call count, minutes and dollars, then stop and tell the user). The killswitch costs about 20 lines and earns a second track.

## 3 hardest judge questions

**1. "Google Ask for Me, Gemini or Meta will just do this."**
They sell attention and hardware, and they optimize for their own ecosystem. Fixline is a buyer-side agent that commits to an outcome. That means identical-spec matching, a safety gate with accountability, and a graph of real supplier quotes that nobody else collects. Big platforms won't tell you which counter has the cheapest part or put their name behind a refusal. We're also the only option that works on a dumb phone and in a place with no data signal.

**2. "Where's the moat? Voice agents are a commodity."**
The moat is the data from each call: model-to-BOM-to-cross-reference, plus live price and stock per supplier. Day one is thin, and we say so. After N calls, a quote that took 10 minutes of calling comes from cache in seconds. Suppliers also learn to answer our agent, the way a counter clerk learns a regular. A competitor starts at zero on every part number.

**3. "Why would an enterprise trust an AI calling suppliers and spending money?"**
Hard limits are enforced in code, not in the prompt: a spend cap, an approved-vendor list, and a spoken confirmation before any order. Every call is recorded with a transcript and an audit trail. The agent escalates instead of guessing. The first buyers are field crews who already phone parts counters from the yard, so we replace a manual call, not a procurement system.

**Caveat on sources:** I did not verify live pricing, current Google Ask for Me coverage, or that Meta's Live AI has shipped. All pricing comes from third-party blogs. Check those before quoting numbers on stage.