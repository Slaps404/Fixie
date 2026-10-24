## A. Past c0mpiled winners and what judges rewarded

I found no write-ups for c0mpiled-5 (UCSD), SF, Tokyo or Seoul, and no winners from X, LinkedIn or Devpost. The c0mpiled-5 event pages ([startupsd](https://startupsd.org/event/c0mpiled-5-ucsd-future-interfaces/), [Luma](https://luma.com/lje8fm42)) only give the brief ("interfaces that dynamically adapt to each user"). The c0mpiled-16 Luma page ([link](https://luma.com/compiled-im3b)) lists no past winners. compiled.sh has recaps for only these editions:

| Edition | Winners | Signal |
|---|---|---|
| [c0mpiled-2, Abu Dhabi, "Adaptive City"](https://www.compiled.sh/articles/c0mpiled-2-the-adaptive-city-post-mortem) | 1st: "Attention Is All You Need" (agents orchestrate industrial tasks from real-time worker focus). 2nd: AquaAI (autonomous urban water decisions). 3rd: Kanban Team (UAE real-estate compliance workflow). | Recap says winners "built visionary autonomous systems, not just dashboards." |
| [c0mpiled-10, DC, "AI for Government"](https://www.compiled.sh/articles/c0mpiled-10-dc-ai-for-government) | 1st: ATO Copilot, a solo build described as "TurboTax for government security approvals," scored 10/10. 2nd: TerraTrace.ai. 3rd: BillTrax. | The top two came from the smallest track. 15 of 32 entries were solo. Judges walked the floor giving feedback. Top 5 pitched live. |
| [c0mpiled-13, SF, Startup School II](https://www.compiled.sh/articles/c0mpiled-13-startup-school-hackathon-ii) | 1st: Plop (room photo to real, purchasable furniture via Channel3 API). 2nd and "Most Venture Backable": Cambrian. 3rd: Airlock (MCP security proxy). Also "Swiper No Swiping" and "Most Beautiful." | Recap: "narrow user problems worked best" and complete workflows won. Teams combined sponsor APIs. Six teams found paying-customer leads that night. |

**Takeaways for us**
- Winners are one sharply defined user plus a finished end-to-end workflow with real-world output. Plop's pitch was "real products, not imagined ones." Our equivalent is a real part and a real price.
- A vivid analogy, like "TurboTax for X," scored well.
- Organizers' recaps list "chaotic" Loom/GitHub submissions and venue Wi-Fi failures. Record the demo video early, tether a phone, and cache everything.
- c0mpiled-2's recap says a two-minute demo works best. We have three minutes, so pre-record the phone call as a fallback.
- Judges include YC founders from Corgi, Conduit and Agentin, and an EF founder from Meadow. Expect questions on defensibility and whether it is a business.
- Tracks 2 and 3 map directly onto our idea. For No App, the user never looks at a screen. For Unsupervised, the supply-chain agent has to show stop conditions.

## B. Competitive landscape

**iFixit FixBot.** Launched December 2025 on web and in the iFixit app. It takes chat, photo and voice, and is grounded in 125k repair guides, the Q&A forum and PDF manuals. The free tier has daily limits, and a paid tier with voice diagnostics (alpha) is "coming soon" at about $4.99/month. There is also an enterprise edition for repair shops and field teams. Sources: [9to5Mac](https://9to5mac.com/2025/12/09/ifixit-launches-fixbot-ai-repair-helper-with-free-and-paid-versions/), [iFixit](https://www.ifixit.com/Info/FixBot_Pro).
- It is screen and app first.
- It stops at the how-to and does not source or negotiate parts.
- Older and niche models are weak, because it falls back to web search.

**PartSelect and RepairClinic.** I found no evidence of an AI assistant from either. They are parts catalogs (PartSelect lists about 2M parts) with model-number lookup and repair videos. This is a gap, but I only found no source, not proof they have none.

**Frontdoor video chat.** The first video chat is free, and unlimited chats cost $25/year or come with Prime/Premium plans. It connects to a human appliance expert, who sends recap notes and parts links in the app. It then upsells in-home pros. Sources: [Frontdoor](https://www.frontdoor.com/membership/frontdoor-unlimited), [press release](https://www.mannpublications.com/mannreport/2023/09/14/frontdoor-debuts-unlimited-video-chats-for-prime-and-premium-members/). "ExpertOnCall" returned no hits, so I could not confirm it. I did not research Angi, Thumbtack or Sears Home Services beyond a search that returned nothing, and they are all human dispatch marketplaces anyway.

**Voice AI for appliance-repair businesses.** [Retell](https://www.retellai.com/use-cases/appliance-repair-answering-service), [Voiceflow](https://www.voiceflow.com/industries/appliance-repair-companies), [ElevenLabs](https://elevenlabs.io/ai-answering-service/appliance-repair-industry) and [Teneo](https://www.teneo.ai/blog/ai-agent-for-appliance-support-faster-fixes-without-wait) sell answering and booking agents to the repair company. Nobody in the results serves the homeowner or senior side.

**Agents that call businesses for you**
- This is the main threat. Google AI Mode places calls to local stores for stock and pricing. It launched July 2025 ([TechCrunch](https://techcrunch.com/2025/07/16/google-rolls-out-ai-powered-business-calling-feature-brings-gemini-2-5-pro-to-ai-mode)). I/O on May 19, 2026 expanded it to home repair, with a US rollout "this summer" ([coverage](https://www.shopifreaks.com/googles-ai-mode-can-now-call-local-stores-to-check-product-availability-and-lets-users-track-prices-for-specific-hotels/)). That is secondary reporting. The feature needs a screen and a search, and only calls businesses surfaced in local search.
- I found no YC or startup doing "AI calls to negotiate your price." [Callbook AI (YC S26)](https://yespress.io/callbook-ai-yc-s26.md) does debt collections in Latin America.
- The [YC "Call My Agent" hackathon](https://events.ycombinator.com/CallMyAgentHackathon) (AgentPhone, May 2026) shows phone-capable agents are hot and judges have seen many of them. I could not find its winners.

**"Old PCB thing."** I found nothing at c0mpiled that matches. These are guesses. It could mean the physical board in a dead appliance, since many failures (an AC control board, a washer main board) are a board swap. Or it could mean PCB-diagnosis startups like [Tuurny](https://roboticsandautomationnews.com/tag/pcb-repair-automation/) (photo plus LLM fault finding, NASA/Texas A&M, 2025) and Alternative Circuits' LabPCB. Ask the teammate who said it. A cheap way to use it is a board-photo mode: the user texts a photo of the control board, and the agent reads the part number and sources the board.

## Gaps and differentiation
1. Nobody does voice-first repair for non-technical people. FixBot, Frontdoor and Google all assume a screen or app.
2. Nobody connects diagnosis to sourcing. FixBot ends at the how-to, and PartSelect ends at the catalog.
3. Google's calling is a search feature for stores and local pros. It does not call OEMs or distributors, does not negotiate, and does not do the repair walkthrough.
4. Outbound calls are a real Unsupervised-track story. The agent runs a call queue with a budget cap, a loop limit and a stop condition, then reports by phone.

**Differentiation line:** "FixBot gives you a manual and Google gives you a search result. We give you a phone number. We fix it with you by voice, then call the factory and the parts distributors to get the part cheapest. You never touch a screen."

**Demo suggestion.** Use a live inbound call from a "grandma" role, then a pre-recorded outbound supplier call, and show a savings figure such as "$X below retail." Compare against PartSelect's quoted price as a baseline, but verify it beforehand.