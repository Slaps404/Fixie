## Bottom line
As of Oct 24, 2026, no general assistant covers the whole loop of diagnosing, finding the exact part, calling sellers, negotiating, following up and getting a spoken "yes" to buy, on a plain phone call. Google is the closest and is the real threat. The rest are weaker on outbound calling. Several findings below come from secondary or vendor sources. Those are flagged "unconfirmed".

## What each assistant does

- **Google (Search, AI Mode, Duplex-based "Let Google Call")** is the closest competitor.
  - Ask for Me started as a Labs test on Jan 30, 2025, covering only nail salons and auto repair. Retail calling launched in the US in Nov 2025, with Gemini picking the stores and questions ([TechCrunch](https://techcrunch.com/2025/11/13/google-expands-ai-shopping-with-conversational-search-agentic-checkout-and-an-ai-that-calls-stores-for-you), [9to5Google](https://9to5google.com/2025/11/13/google-agentic-shopping/)).
  - At I/O on May 19, 2026, Google extended calling to local services, naming home repair, beauty and pet care, with a US rollout "this summer". The rollout was still in progress in early August ([NerdLevelTech](https://nerdleveltech.com/ai-agents-calling-businesses-voice-handoff), [Ovative](https://ovative.com/impact/expert-insights/the-biggest-search-announcements-from-google-io-2026/)).
  - Limits:
    - It is US-only, excluding IN, LA, MN, MT and NE.
    - Calls are recorded.
    - It is triggered from Search, so you need a screen.
    - Results come back as a summary by email or text ([SEJ](https://www.searchenginejournal.com/google-search-can-now-call-local-businesses-using-ai)).
    - It targets local shops and service providers. Nothing I found says it calls parts distributors.
    - Google may use Merchant Center data instead of calling.
- **ChatGPT**
  - Voice reached desktop on Jul 23, 2026, and Sep 23 added plugins and ChatGPT Work for tasks like email, calendar and Slack ([noqta](https://noqta.tn/en/news/openai-chatgpt-voice-desktop-gpt-live-codex-2026), [aiweekly](https://aiweekly.co/alerts/openai-wires-chatgpt-voice-into-work-agent-and-gpt-6-models)).
  - The 1-800 number is inbound only, so you can call ChatGPT but it can't call out ([Forklog](https://forklog.com/en/openai-introduces-phone-and-whatsapp-access-to-chatgpt/)).
  - I found no first-party outbound calling.
- **"Dot" has two meanings.**
  - New Computer's Dot, the companion app, shut down on Oct 5, 2025 ([Benzatine](https://benzatine.com/news-room/ai-companion-app-dot-to-close-its-doors-a-farewell-to-virtual-friendship)).
  - OpenAI's "Dots", announced at DevDay on Sep 29, 2026, are more likely what a judge means. Each is an always-on agent with its own cloud computer and browser, connected to 4,000+ apps. It is available to Pro and Business Premium users and reachable through ChatGPT, Slack or Teams. Users can set rules such as confirm-before-acting ([TNW](https://thenextweb.com/news/openai-dots-always-on-ai-agents-cloud-computers-devday), [tbreak](https://tbreak.com/openai-dots-always-on-ai-agents/)).
  - I found no phone-calling capability for Dots. They are screen and app agents.
  - Beware the fake GitHub "Dots" download that turned up in search.
- **Meta Ray-Ban and Meta AI**
  - The Ray-Ban Display ($799) shipped Sep 30, 2025 ([Bloomberg Law](https://news.bloomberglaw.com/artificial-intelligence/meta-launches-799-glasses-with-screen-and-ai-integration)).
  - Update v26 on Jun 29, 2026 added Muse Spark as the glasses' AI model. v25 added reading email aloud ([Meta release notes](https://www.meta.com/help/ai-glasses/1809764829519902/)).
  - A reported "super sensing" mode would run Live AI in the background for hours ([UploadVR](https://www.uploadvr.com/next-gen-ray-ban-meta-2026-super-sensing-facial-recognition-live-ai/)).
  - I found no outbound business calls. One low-quality aggregator claims "autonomous purchasing" in the Muse agent, which is unconfirmed.
  - Strengths are vision-based "what is this" and step-by-step help. It needs a paired phone and about $300 to $800 of hardware.
- **Grok**
  - xAI sells the answering side: Voice Agent Builder (beta Jul 1, 2026, about $0.06 per minute) and Grok Voice 3.0 (Oct 14, 2026, vendor-reported) ([NerdLevelTech](https://nerdleveltech.com/ai-agents-calling-businesses-voice-handoff), [AF.NET](https://af.net/realtime/xai-launches-grok-voice-3-0-for-high-volume-conversational-calls/)).
  - I found no consumer product that places calls for you.
- **Siri**
  - Reported iOS 27 plans: a rebuilt, Gemini-powered, always-on agent that acts across apps, with Extensions for Claude and Gemini ([9to5Mac](https://9to5mac.com/2026/05/12/ios-27s-completely-rebuilt-siri-will-include-a-new-system-wide-search-gesture-report/), [MacRumors](https://macrumors.com/guide/wwdc-2026-what-to-expect)).
  - It acts through app APIs. I found no outbound calling.
  - I couldn't confirm whether it has shipped.
- **Alexa+**
  - It books through partner APIs: Thumbtack, OpenTable, Uber, and Angi, Yelp, Expedia and Square in 2026 ([TechCrunch](https://techcrunch.com/2025/12/23/amazons-ai-assistant-alexa-now-works-with-angi-expedia-square-and-yelp/), [Amazon help](https://digprjsurvey.amazon.com/csad/help/node/TW5iNz0g81SxJVm77q)).
  - It confirms before booking. I found no evidence it phones businesses.
  - Its voice-first, no-phone form factor is the closest match to our "No App" angle.
- **Pine AI** is the main startup calling businesses for consumers.
  - It negotiates bills, cancels subscriptions and chases refunds, by phone, email and software ([Pulse 2.0](https://pulse2.com/pine-ai-profile-stanley-wei-interview/), [Boston Globe](https://www.bostonglobe.com/2026/06/02/business/pine-ai-agent-2/)).
  - It claims a 93% success rate, which is company-reported.
  - It is an app, not a repair or parts product, and it always discloses it is an AI.

## Capability matrix

Key: Y = ships, P = partial or planned, N = not found. Cells marked (i) are my inference rather than a sourced finding.

| Capability | Google | ChatGPT / Dots | Meta glasses | Grok | Siri | Alexa+ | Fixline |
|---|---|---|---|---|---|---|---|
| Diagnose by voice or camera | Y (Gemini Live) (i) | Y | Y | Y | P | P | Y |
| Identify exact part by model number | P | P | P (vision) | P | N | N | Y |
| Compare sellers | P | P | N | N | N | P | Y |
| Place outbound calls | Y (local, US) | N | N | N | N | N (unconfirmed) | Y |
| Call parts distributors, not shops | N (i) | N | N | N | N | N | Y |
| Negotiate | N | N | N | N | N | N | P |
| Long-running follow-up | P | Y (Dots) | P | N | N | P | Y |
| Buy | P (agentic checkout) | P (Dots confirm rules) | unconfirmed | N | P | P (partner bookings) | Y |
| Works with no smartphone or screen | N | N | N | N | N | P (speaker) | Y |
| Persistent per-asset memory | N (i) | P (general memory) (i) | N | N | N | N | Y |
| Safety gate and escalate to a pro | N (i) | N (disclaimer only) (i) | N | N | N | N | Y |

## Gaps we can own

1. **Parts-supply calling.** Google's calling targets consumer local services. Nothing I found calls distributors, supply houses or OEM dealers to match a part by model number. Our demo of AC part, model number, then call suppliers is a different category from "check pricing at a groomer".
2. **A phone number, not a device.** Everything above needs glasses, a smartphone, a screen or a subscription. A plain dial-in works on a flip phone, in a truck or in a blackout. That fits the No App track and field crews.
3. **A safety gate with accountability.** General assistants give disclaimers. We can hard-gate gas, electrical and refrigerant work and hand off to a licensed pro, with a logged reason. Corgi (insurance) and Clean would care about this.
4. **Asset memory.** We can keep each asset's model, serial number, repair history and approved suppliers, and make that the product's moat.
5. **Closed loop with a spoken "yes".** The agent works for hours and calls back for authorization. Dots offer confirm-before-acting, but only on screens.
6. **Enterprise version.** Port, yard, fleet and defense maintenance runs on NSN or OEM part numbers, with approved-vendor lists and spending caps. A consumer assistant won't have those, and the Unsupervised track rewards the stuck, loop and overspend guardrails. The enterprise framing is my suggestion. I did not research those markets.

## Risks to flag
- Google's rollout may reach home repair this fall. Our answer is that we call parts distributors and don't depend on Search.
- No final FCC rule on AI disclosure was found as of Aug 4, 2026. FCC 24-17 treats AI voices as "artificial" under the TCPA. Disclose that the caller is an AI at the start of every call, as Pine does ([NerdLevelTech](https://nerdleveltech.com/ai-agents-calling-businesses-voice-handoff)).