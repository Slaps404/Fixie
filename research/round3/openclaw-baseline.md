**The OpenClaw test: what Fixie adds over OpenClaw (or Claude/ChatGPT agent mode) plus a calling skill**

Verification: the sources are mostly secondary, such as doc mirrors, blogs and marketplace listings. I could not reach the official docs.openclaw.ai pages directly. I found no measured reliability data for agent phone calls.

**What OpenClaw is today**
- **Gateway:** One long-running process (WebSocket, port 18789) runs cron, webhooks, memory and channels. A heartbeat checks `HEARTBEAT.md` every 30 minutes by default. Channels include WhatsApp, Telegram, Signal and iMessage (macOS). Memory lives in `MEMORY.md` files. ([clawdocs](https://clawdocs.org/architecture/overview), [Medium](https://medium.com/@dingzhanjun/deep-dive-into-openclaw-architecture-code-ecosystem-e6180f34bd07), [heartbeat vs cron](https://lumadock.com/tutorials/openclaw-heartbeat-vs-cron-vps), [CLI cheatsheet](https://www.stanza.dev/cheatsheet/openclaw-cli))
- **Skills:** A skill is a `SKILL.md` directory, distributed through ClawHub.
- **Built-in calling:** The official `@openclaw/voice-call` plugin supports Twilio, Telnyx and Plivo. It has a realtime mode (Gemini Live or OpenAI) and DTMF tools. ([plugin docs mirror](https://cdn.jsdelivr.net/npm/openclaw@2026.7.1-2/docs/plugins/voice-call.md))
  - Defaults: `maxDurationSeconds` 300, `maxConcurrentCalls` 1, and `inboundPolicy` disabled.
  - The doc calls the inbound allowlist a "low-assurance caller-ID screen".
  - The doc I read says nothing about voicemail detection.
- **Other options:** The Vapi MCP server can create outbound calls, immediate or scheduled ([Vapi MCP](https://glama.ai/mcp/servers/@VapiAI/mcp-server)). I found no Twilio MCP server (unverified either way). Community restaurant-booking skills exist (Telnyx + Gemini Live; PollyReach, with about 31 installs). All are self-reported ([DEV](https://dev.to/lars_winstand/i-think-i-found-the-first-openclaw-voice-workflow-normal-people-might-actually-keep-3ca8), [myclaw](https://myclaw.ai/skills/agent-phone-call)).
- **Security record:**
  - ClawHavoc: Koi Security flagged 341 of 2,857 ClawHub skills as malicious, many delivering an infostealer. Antiy later counted at least 1,184 ([Hacker News](https://thehackernews.com/2026/02/openclaw-integrates-virustotal-scanning.html), [Antiy](https://www.antiy.net/p/clawhavoc-analysis-of-large-scale-poisoning-campaign-targeting-the-openclaw-skill-market-for-ai-agents/)).
  - ClawJacked: a malicious website could brute-force a local gateway.
  - Prompt injection: researchers showed it can backdoor an instance.
  - Payments: one flagged skill, `buy-anything`, harvested card details. ([Register](https://theregister.com/2026/02/05/openclaw_skills_marketplace_leaky_security/), [Privacy.com](https://www.privacy.com/blog/is-openclaw-safe-ai-agent-access))
  - The "21,000 exposed instances" figure is unverified.

**(a) Trivial in an afternoon (your teammate is right here)**
- Diagnose from text or a photo of the model sticker.
- Look up the part number.
- Place one outbound call to a supplier or the warranty line with a brief.
- Parallel calls: raise the cap above 1, or use the Vapi MCP.
- Scheduled follow-up through cron.
- Text or WhatsApp the user an update.
- Tell the agent to ask for approval before ordering.
- Any "calls 3 stores and compares prices" demo that works on a good day.

**(b) Possible but painful or unreliable**
- **Phone trees and voicemail:** I found no AMD (answering-machine detection) setting in the plugin doc. You have to write it yourself.
- **Hard guardrails:** The default cap is 5 minutes per call, but there is no documented per-task $ cap, vendor allowlist or global kill switch. Payment safety depends on third-party skills such as single-use virtual cards. Amazon's AgentCore pattern bounds authority by recipient, amount, budget and expiry ([AWS](https://aihub.hkuspace.hku.hk/?p=8056)).
- **Voice walkthrough of a repair:** It can be done, but the agent has no idea where the user is in the steps, and it has to wait for a "delivered" event.
- **Inbound calls from a real person:** It is possible, but the doc itself warns caller-ID checks are not identity.
- **Setup:** You need a public webhook, a tunnel, and a self-hosted gateway. Most consumers will not do that.

**(c) Structurally hard for a general personal agent (ranked by what Fixie can demo today)**
1. **Landline and no-smartphone user, with inbound number as the product.** Dorothy dials one number and talks. OpenClaw's front door is a chat app on a smartphone (ClawdTalk exists but is mainly for calling your own agent). The user can be anyone, not only the person who installed it. Fully demoable live. *Caveat:* Google AI Mode and Gemini do call local businesses, so never claim this is unique. The claim is only that the user needs no app, device or setup.
2. **Safety gate as code.** Gas, refrigerant and high voltage route to a pro, enforced before any instructions are given. You can demo it with a counter-example: a gas dryer, where Fixie refuses to continue. This directly addresses the Unsupervised track's stuck/overspend/stop criteria. Your slide should show the deterministic caps. Do not claim it is safer than OpenClaw in general, since a careful user could build the same thing.
3. **Physical verification.** After "delivered", Fixie calls back, talks her through the install, and confirms the dryer heats. The verification is spoken ("is it warm?"), so it is weaker than a sensor. Honest label: closed-loop confirmation by voice. Demoable.
4. **Multi-party coordination (user, suppliers, warranty line).** Demoable, since you already do parallel calls. Adding a caregiver text ("Dorothy's dryer is fixed") is a cheap add.
5. **Enterprise integration (J1939 fault triggers the same engine).** Demoable as a simulated telematics webhook. Say so. A real fleet integration is not demoable today.
6. **Cross-user price/parts graph.** Only a schema and a cache can be shown, built from the demo calls. Claim it as the roadmap and nothing more. It is the strongest long-term moat, but it needs real volume.
7. **Supplier-side relationships and payment escrow.** Mock order only. Do not claim escrow.
8. **Liability and insurance.** Not demoable. At best, mention Corgi's insurance angle as the path.

**Verdict for pitch**
- Concede (a) openly: "yes, you can build the calls with OpenClaw." Judges from Conduit and Agentin will respect that.
- Lead with items 1–3 as one story: the person who can't use an agent gets an agent, and it refuses to do the dangerous repair.
- Show an in-code audit trail from the call log (call count, minutes, $, stop reason). That is where an Unsupervised-track judge will look.
- Mention the ClawHavoc numbers carefully, with citation: a consumer-facing agent can't rely on an open skill marketplace.
- Cross-user data is the roadmap, not a feature.

Unverified: OpenClaw voicemail handling, Twilio MCP existence, any real OpenClaw success rate on supplier calls, and the 21,000 exposed-instances number.