**Winning agent hackathon projects 2025-26: patterns, template smells, copyable tactics (research, Oct 24 2026)**

**Coverage gap.** I could not find full winner lists for CalHacks 12, HackMIT 2025, TreeHacks 2026 (voice) or the Vapi and ElevenLabs 2026 events. Treat anything beyond the items below as unverified.

## What actually won (verified items)

| Event | Winner | Why it stood out |
|---|---|---|
| YC Call My Agent, May 17 2026, hosted by AgentPhone | **Gavel** took 1st. You text it an item and it lists it, negotiates with buyers, and schedules pickup. **Chief** took 3rd. It is an "overhearing" agent that proactively acts for you. Sources: [AgentPhone page](https://agentphone.ai/callmyagent), [Chief repo](https://github.com/bliu8/chief). | The agent runs a whole outcome loop with real counterparties. It is not a single call. Chief's trigger is ambient listening, so the user never prompts it. The winners list is unconfirmed beyond AgentPhone's own page. |
| NextWave 2026 (Mexico City local winner, self-reported; 4th globally per its LinkedIn posts, unconfirmed) | Voice agents that call several carriers at once, rank the quotes, and get a container off the terminal before demurrage starts. "The agent proposes while deterministic code approves." Source: [Yuno/Nauta release](https://www.y.uno/en/newsroom/yuno-and-nauta-hackathon) | This is Fixie's architecture, and it already exists. It won locally with an enterprise cost story. The global winner was **AgentPay**, which lets agents buy things without unrestricted access to a user's money. Guardrails won the global prize. |
| ElevenLabs Worldwide Hackathon, Feb 2025 | **Gibberlink** won global. Two AI agents on a phone call realize they are both AI and switch to the ggwave audio protocol. Judges said "intriguing demo," and the clip went viral. Source: [ElevenLabs](https://elevenlabs.io/blog/announcing-the-winners-of-the-elevenlabs-worldwide-hackathon) | It used a novel modality, a 20-second demo, and one visible "wow" moment. |
| ElevenLabs, same event | **Sentinel** won the Sydney leg. It is an autonomous voice agent for disaster rescue teams. | The stakes were physical, and it used a defined user. |
| Anthropic Built with Opus 4.7, April 2026 | 2nd **Wrench Board** (electronics repair from schematics). **MaestrIA** (home repair that connects you with tradespeople) won the "Keep Thinking" prize. **ARIA** (factory maintenance) won Best Use of Managed Agents. 1st was MedKit. Source: [blockchain.news](https://blockchain.news/news/anthropic-opus-4-7-hackathon-winners) | Repair and maintenance is already a crowded prize category. You can expect at least one repair project in Saturday's pool. |
| TreeHacks 2026 | Grand prize went to **Shepherd**, a motorized smart cane with computer vision. Source: [Stanford Daily](https://stanforddaily.com/2026/02/15/12th-annual-treehacks/) | The winner was hardware, and a judge could hold it. |
| c0mpiled | Per the repo's earlier research, winners had one sharp user and a finished workflow. | Same pattern. |

## Patterns

1. **Closed outcome beats a single call.** Gavel ends with a pickup scheduled. Fixie's equivalent is the verified fix.
2. **The trigger is novel, not "user asks."** Chief listens to ambient audio, Gibberlink negotiates between agents, and Shepherd uses a sensor. Fixie's J1939 fault code is this kind of trigger.
3. **Guardrails are now a winning feature.** AgentPay won NextWave globally, and the demurrage team's "deterministic code approves" line is the headline.
4. **There is one visible wow beat.** Gibberlink is the example.
5. **Real counterparties are the norm.** Gavel talks to real buyers, and AgentPhone's own page lists live numbers for entrants. A recorded sandbox call reads as "toy."
6. **Measured outcomes are rare.** An August 2026 industry post says "no one has published credible completion rates for real-world tasks" ([dev.to/Assindo](https://dev.to/assindo/ai-agent-news-august-2026-the-calling-gap-starts-to-close-19dd)). That author sells a calling service, so treat the framing as biased. It still points to an opening.

## Five template smells and how Fixie avoids each

1. **"Agent calls a business and reads the answer."** Google now does this ([SEJ](https://www.searchenginejournal.com/google-search-can-now-call-local-businesses-using-ai)). Fixie should never present the call as the product. The product is the safety-gated, price-normalized decision for an identical part number, and the call is plumbing.
2. **"Vapi plus Twilio plus a prompt."** NextWave and Call My Agent entrants use the same stack. Show the non-prompt parts: the deterministic approval layer, the vendor allowlist, and the kill switch triggering live. Put "approved by code, not by model" on a slide.
3. **"Sandbox demo with fake vendors."** Call at least one real business, even if it's only a parts counter asking "is this in stock?" Disclose the mock order. Keep a recorded fallback.
4. **"Chat-with-agent UI over a phone call."** Show the system's state as a live event timeline projected next to the call: call legs, caps remaining, and a stuck-detector tripping. This also serves the Unsupervised track.
5. **"Elderly-user empathy theater with no metric."** Dorothy needs a number: about $9 versus about $200, time to part ordered, and calls placed versus cap. Add one counted proof, such as "N real calls today, M voicemails detected, K stopped by cap."

## Three tactics to copy in under 2 hours

1. **A single viral beat, Gibberlink style (about 45 minutes).** Build one 20-second moment, such as the safety gate vetoing a gas repair mid-call with an audible "I'm handing you to a pro." Record it as a clip.
2. **Proof panel (about 45 minutes).** Add a live counter on the screen showing real calls placed, real businesses reached, dollars saved, caps hit, and the last agent decision with "approved by: code." This copies AgentPay and NextWave's "agent proposes, code approves."
3. **A callable demo number for judges (about 30 minutes).** Entrants like Disi and Miranda publish a live number. Put Fixie's number on the final slide and let judges call it, with a spend cap per caller. A judge who can phone it in the room is the strongest differentiator against "tell OpenClaw to do it."

**Positioning line for the OpenClaw critique.** A general agent can place a call. Fixie is the domain-specific, safety-gated, event-triggered loop that closes the outcome, and its guardrails live in code. NextWave and AgentPay show judges reward that framing. I did not verify OpenClaw's current phone-calling skills, so don't claim it "can't."