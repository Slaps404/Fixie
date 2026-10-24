## Recommendation: Vapi + Twilio (paid, ~$20 upgrade) + Claude/Gemini vision + one small webhook server

This is the fastest path I found. It is a judgment call from the research below, not a benchmark. Plan B is ElevenLabs Agents on the same Twilio number.

### Comparison (vendor figures, not benchmarks)

| Option | Setup | Outbound | Tools / webhook | Credits / notes |
|---|---|---|---|---|
| **Vapi** | Minutes. [Free US number, no card, active in a few minutes](https://docs.vapi.ai/quickstart/phone). | **Free Vapi numbers are inbound-only.** Outbound needs an [imported Twilio, Telnyx or DIDWW number](https://docs.vapi.ai/phone-numbers/import-twilio). | Strongest: server-URL tools, end-of-call webhooks, `POST /call` with per-call overrides. | About [$10 free credit](https://support.vapi.ai/t/27525359/is-1000-minutes-free-forever-or-its-a-limited-time-offer) per support threads, amounts disputed. The old 1,000 free minutes are gone. Real cost [about $0.15-0.35/min](https://elevenlabs.io/blog/vapi-alternatives), per a competitor's post. |
| **Retell** | Similar to Vapi. | Yes. | Yes. Built-in [SMS nodes and texting agents](https://retellai.com/blog/unlock-ai-texting-with-retell-ai-voice-agents). | [$10 free credit, about $0.07/min base](https://www.coval.dev/blog/vapi-vs-retell-ai-which-voice-ai-platform-is-right-for-your-project). I found nothing on inbound MMS. Check the docs. |
| **ElevenLabs Agents** | [Native Twilio import](https://elevenlabs.io/docs/agents-platform/phone-numbers/twilio-integration/native-integration) in minutes, with best-in-class voices. | Yes, on purchased Twilio numbers. Verified caller IDs can place outbound calls but can't receive. | Yes. | I found no confirmed free-credit amount. |
| **Twilio ConversationRelay** | About 1 hour. You build the WebSocket LLM loop yourself. Twilio does STT and TTS. | Yes. | Full control. | [Twilio claims 0.5-1s](https://www.twilio.com/en-us/blog/developers/tutorials/product/ai-phone-agent-twilio-conversation-relay), with tutorials for [Claude](https://www.twilio.com/en-us/blog/anthropic-conversationrelay-token-streaming-interruptions-javascript). More code to write. |
| **OpenAI Realtime SIP** | Riskier. Point a Twilio SIP trunk at OpenAI, then accept the call from a webhook. | Not covered in what I read. | Yes. | The [docs conflict on naming](https://developers.openai.com/api/docs/guides/realtime-sip) (`realtime.call.incoming` vs `live.transport.incoming`). Likely the lowest latency, but too much doc drift for today. |
| **Gemini Live, Pipecat, LiveKit** | Slowest. | You host it and wire telephony yourself. | Yes. | Skip for a 4.5-hour build. Use Gemini only for vision. |

I did not research Bland. Skip it.

### Photo mid-call (the hard part)
- **No platform natively merges an MMS into a live call.** Don't design around that.
- **Pattern that works on any platform:**
  1. Tell the caller: "Text a photo of the sticker to this same number."
  2. Twilio's inbound-message webhook hits your server, which downloads `MediaUrl0` (Twilio basic auth) and keys it by the sender's `From` number.
  3. A Vapi tool `check_photo()` fetches the latest image for the caller's number.
  4. The server sends the image to Claude or Gemini vision and returns structured JSON (brand, model number, serial, visible fault) as the tool result. The agent then says "I see a Carrier 24ACC636, correct?"
- **Fallbacks:** If the photo hasn't arrived, the agent says "Tell me when it's sent" and re-calls the tool. Also let the caller read the model number aloud.
- **FaceTime is not feasible.** Apple offers no programmatic FaceTime endpoint. Any video link (Twilio Video, LiveKit) needs a screen, which breaks the track-2 rule. Use MMS, which seniors can do from the camera app. A caller texting a photo is a screen interaction, so be ready to defend it as optional.
- **Inbound MMS on an unregistered number:** I believe it still arrives, but I didn't verify this. Test with one text in the first 10 minutes.

### SMS registration and trial gotchas ([Twilio docs](https://www.twilio.com/docs/messaging/guides/how-to-work-with-your-twilio-free-trial-account-us-only))
- Trial accounts can only call or text **verified numbers** (up to 5). Verify every teammate and judge-demo phone now.
- **A2P 10DLC registration requires a paid account.** [AT&T manual review reportedly takes 2-4 weeks](https://www.telphiconsulting.com/blog/twilio-a2p-registration-timeline) (a consultancy estimate), so it won't finish today.
- Since June 30, 2026, [new campaign registrations require a privacy policy URL and terms URL](https://www.twilio.com/en-us/changelog/a2p-10dlc-campaign-registration-will-require-privacy-policy-and-).
- **Workarounds:**
  - Don't send outbound SMS in the demo. Report back by **voice callback** instead, since voice isn't subject to 10DLC. This also fits the no-screen theme.
  - If you need SMS, a verified toll-free number is free to verify but not instant. On a trial it only reaches 5 pre-designated numbers.
  - Texting to your own verified numbers on a trial is enough for a demo.
- **Upgrade Twilio to paid ($20)** to drop the verified-number limits on voice. This also removes the trial voice preamble.
- **Vapi + Twilio import quirk:** Vapi [overwrites the number's "A Call Comes In" webhook](https://vapi.ai/community/m/1428463486727491716). Use a separate Twilio number for the SMS/MMS webhook. A Twilio-bought number then gets its Messaging webhook set to your server and its Voice side set to Vapi. Voice and messaging webhooks are separate fields, so one number may work. Test it.

### Architecture
1. **Twilio number A** (paid, imported into Vapi) handles inbound calls, outbound supplier calls and the callback. Its Messaging webhook points to your server `POST /sms`.
2. **Vapi assistant "Fixie"** uses Claude Sonnet or GPT-4o-class with a short, spoken-style prompt and a diagnostic script. Its tools are `check_photo`, `lookup_part` and `start_sourcing`.
3. **Server** (FastAPI or Node on a stable ngrok/Cloudflare tunnel, or Railway/Fly):
   - `/sms` stores the media.
   - `/tool` handles Vapi tool calls and runs vision.
   - `/sourcing` launches outbound calls with `POST https://api.vapi.ai/call` using `assistantId` or a transient assistant and `phoneNumberId`. Per-supplier overrides carry the part, model number and price ceiling.
   - `/vapi-events` receives `end-of-call-report`. It parses price and availability from the transcript with an LLM and ranks quotes.
4. **Callback:** after sourcing finishes, `POST /call` to the user's number with a summary assistant ("I found it for $41 at X, shipping Tuesday").

For the demo, the "suppliers" should be 2-3 teammates' phones with scripted personas, one of which counters on price. Do not cold-call real businesses. Have the agent disclose it is an AI assistant.

### 30-minute path to a working number
1. **0-5 min:** Create Vapi and Twilio accounts. Add a card to Twilio and upgrade. Buy a US local number with voice (about $1.15/mo). Verify teammate numbers.
2. **5-10 min:** In Vapi, create the assistant (system prompt, first message, voice, model). Turn on background denoising. Import the Twilio number in Dashboard > Phone Numbers > Import Twilio and assign the assistant to inbound.
3. **10-15 min:** Call it from your own phone. Iterate on the prompt.
4. **15-25 min:** Start the server and tunnel. Add one tool (`check_photo`) with the server URL. Set Twilio's messaging webhook to `/sms`. Text a nameplate photo and check the vision output.
5. **25-30 min:** Add the `POST /call` outbound test to a teammate's phone and print the end-of-call webhook payload.

### Demo gotchas for a noisy room
- **Don't use speakerphone near the crowd.** Use a wired headset with a mic, or a phone held to the ear with the audio fed through a mixer or PA. Echo causes false interruptions. Use a headset as a backup for any live demo of agent-to-agent calling.
- **Latency:** keep prompts short, use a fast model and set tool timeouts of 10s or less. Have the agent say a filler phrase ("let me look at that") while a tool runs. Sourcing takes minutes, so pre-stage it and show real call logs.
- **Pre-record a backup video** of the full call flow. Cell reception in the MPR can be poor, so bring a hotspot and test the tunnel.
- **Trial limits:** an unverified callee fails silently ("Customer Busy" in [Vapi reports](https://support.vapi.ai/t/33097092/hi-team-quick-question-about-imported-twilio-numbers-we-impo)). Free Vapi credit (about $10) runs out fast at $0.15-0.35/min, so top up or watch minutes.
- **Don't change webhooks right before the demo.** Check the Vapi and Twilio status pages. [Twilio had a 10DLC delay incident on Sep 18](https://isdown.app/status/twilio/incidents/656945-delays-with-phone-number-provisioning), so don't rely on number changes during the event.

Pricing and free credit amounts come from third-party and competitor sources, and I did not see the official pricing pages. I also did not verify Vapi's `controlUrl` live-injection feature, so the polling `check_photo` tool is the safer design.