**Bottom line:** Nobody has shipped Fixie's full loop of diagnosis, safety gate, parallel supplier calls, a spoken yes, and a guided install over a landline. The calling primitive is now commodity, though. Google, Gemini, Meta Muse, Instinct, Pine and OpenClaw skills all place outbound calls. Do not pitch "AI that phones businesses" as the novelty.

**"Muse" is Meta Muse**, a personal agent launched Sep 8, 2026 ([Enterprise DNA](https://enterprisedna.co/resources/news/meta-muse-personal-ai-agent-consumer-launch-september-2026)). Outbound calls to US businesses entered a limited beta on Sep 16-17. Instinct Concierge (Noah Shinn) launched a similar feature at the same time ([TechCrunch via BeginnersInAI](https://beginnersinai.org/ai-agents-that-make-phone-calls/)). 404 Media reports Meta also tested human call-center agents placing the calls ([404 Media](https://404media.co/meta-tests-muse-ai-agent-calls-that-are-actually-made-by-humans-in-a-call-center)). Repair and quote examples are not documented for either product.

## Findings by product

**Google AI Mode / "Ask for Me"**
- It calls local businesses for price and availability. The Aug 2026 Retail Insider piece says home repair, beauty and pet care were added this summer ([Retail Insider](https://retail-insider.com/articles/2026/08/when-the-first-customer-to-call-your-business-is-an-ai-assistant/)).
- It only calls businesses already in local search results, then sends a summary in about 30 minutes.
- It identifies itself as an AI, and businesses can opt out.
- It has no purchase step and no follow-up. It starts in Search, so it needs a screen.
- I found no primary Google page confirming home repair. That detail is single-source (unverified).

**Gemini "Call for Me"**
- It only works on a Pixel 11 with a US SIM and a paid Google AI plan.
- It requests service quotes, books appointments, handles phone menus and waits on hold.
- It cannot complete financial transactions, and it has a daily call cap ([iPhone in Canada](https://www.iphoneincanada.ca/2026/09/24/gemini-can-now-make-phone-calls-for-you-canada-has-to-wait/)).
- The user must tap "Call for me" on the phone.

**OpenClaw**
- Phone ability comes from plugins:
  - The official voice-call plugin supports Twilio, Telnyx and Plivo ([docs mirror](https://huggingface.co/spaces/nikhtu10/OpenClawBot/blob/main/docs/plugins/voice-call.md)).
  - Skills exist for ElevenLabs/Twilio ([phone-voice](https://getclawkit.com/skills/official-cortexuvula-phone-voice)) and for [Vapi](https://openskillindex.com/skills/technickai-openclaw-config-vapi-calls).
  - Bland offers a hosted MCP server ([Bland docs](https://docs.bland.ai/integrations/mcp/openclaw.md)).
  - Pine Voice plugs in as well ([Pine](https://www.19pine.ai/es/blog/pine-voice-your-openclaw-agent-can-actually-pick-up-the-phone)).
- Your teammate is right that the raw plumbing is available. What I did not find is a packaged repair, parts or safety-gated workflow, or code-enforced spend caps. That is an absence of evidence, not proof.
- OpenClaw sits behind a chat app and needs a smartphone, so it does not reach a landline user.

**Pine AI**
- It negotiates bills, cancels subscriptions and handles disputes. It raised $25M and plans start at $30/month ([SiliconANGLE](https://siliconangle.com/2026/05/06/pine-ai-aims-consumer-ai-agent-complex-customer-service-interactions/)).
- It stays on a call until resolved and keeps context from earlier calls.
- It does not mention home repair, parallel calls or purchases.
- A warranty-line call is the one place it overlaps with Fixie.

**Duckbill, Yohana, Ohai**
- These are human-in-the-loop concierges. Duckbill's copilots make vendor calls for $99/month and up, and it exposes an MCP integration for agents to request human calls ([Duckbill](https://start.getduckbill.com/kUpU/assistant)).
- Yohana is owned by Panasonic and pairs humans with AI ([GeekWire](https://www.geekwire.com/2022/after-seattle-launch-personal-assistant-service-yohana-goes-nationwide-to-help-more-busy-families/)).
- Ohai is a text-based family assistant ([NeuronFeed](https://neuronfeed.com/startups/ohai-ai)).
- They do slow days-long follow-up, but with humans, and none of them diagnose or source parts.

**Alexa+**
- Angi integration is "coming 2026". Per Amazon it searches for pros and requests quotes by voice ([Amazon](https://www.aboutamazon.com/md/news/devices/alexa-plus-voice-booking-integrations)). Thumbtack is already integrated.
- It works through marketplace APIs, not phone calls. Echo is a screenless voice device, so it is the closest "no screen" rival.
- Whether booking works is unverified.

**ChatGPT**
- I found third-party apps in ChatGPT that place calls: CallForMe (US and Canada) and Autodial ([CallForMe](https://chatgpt.com/plugins/plugin_asdk_app_6ac125e2cffc8191992a7a5f0f3f1c40?locale=cs-CZ)).
- I found no native OpenAI business calling, and nothing on Pulse.

**Siri, Manus, Perplexity**
- I found no business-calling feature for any of them.

**Hey Meadow**
- I could not find heymeadow.ai (unverified). The only "Meadow AI" I found is a Seattle secret-shopper platform for restaurants ([Dealroom](https://dealroom.co/news/157701-meadow-ai-raises-7m-seed-to-give-physical-stores-a-digital-secret-shoppe/)).

**YC startups**
- **Bernard (YC 2026):** AI employees for appliance servicers. It covers diagnosis ("Pre-ID"), parts prep, technician handoff and follow-up ([YC directory](https://www.ycombinator.com/companies/industry/Home%20Services)). It is B2B on the servicer side, but it is the closest domain overlap. Its homeowner voice capability is unclear.
- **HomeBreeze (W21):** Scopes jobs and sends them to a contractor network. It is inactive.
- **Drillbit and Broccoli:** Contractor-side receptionists.
- I found no YC company doing homeowner-side outbound quote calls.

**Hackathons**
- The AgentPhone "Call My Agent" hackathon was at YC SF on May 17, 2026. I found no winner list ([listing](https://internshala.com/competitions/call-my-agent-hackathon/)).
- CallWrench (AI Tinkerers Austin, Vapi) connects customers to tradespeople. It does not call suppliers ([entry](https://austin.aitinkerers.org/hackathons/h_75ypj69x9G8/entries/ht_MvxS4hR_r1I)).
- I found no Devpost project that calls parts suppliers.
- Judges may have seen many "AI that calls" demos, so expect them to look for depth.

## Comparison

| Product | Outbound calls | Multi-day follow-up | Buys | Safety gate | Landline / no screen |
|---|---|---|---|---|---|
| Google AI Mode | Y, home repair (single-source) | N, summary only | N | N | N |
| Gemini Call for Me | Y, Pixel 11 only | N | N, blocked | N | N |
| Meta Muse | Y, beta, some human-placed | Unknown | Claims | Unknown | N |
| Instinct | Y, early access | Unknown | Unknown | Unknown | N |
| OpenClaw plus skills | Y, DIY | DIY | DIY | N | N |
| Pine | Y | Y, bills | Unknown | N | N |
| Duckbill / Yohana | Y, humans | Y | Y | N | Partial |
| Alexa+ / Angi | N, API | N | Unknown | N | Y, screenless |
| Bernard (YC) | Unknown | Y | Parts prep | Unknown | B2B |
| **Fixie** | **Y, parallel** | **Y** | **Y, mock** | **Y, in code** | **Y** |

## Three closest threats

1. **Google AI Mode / Gemini.** It is already live, it has distribution, and it calls home-repair shops for quotes. Answer: Google gathers quotes and does not close, diagnose, gate safety or call back. Fixie also works on a flip phone.
2. **Meta Muse.** It has a stated intent to book, buy and negotiate, and the same agent runs across WhatsApp and Messenger. Answer: it is US-only and screen-bound, it has a human-in-the-loop credibility problem, and it has no stated guardrails or repair domain.
3. **A DIY OpenClaw agent with a Vapi or Bland skill**, which is your teammate's objection. Answer: it works only if the user builds it, and it ships no allowlist, spend caps, stuck detection or kill switch. A "guardrails as product" pitch to the Unsupervised, Conduit and Latted judges is the defensible gap. Bernard is the one to watch if a judge asks about B2B.