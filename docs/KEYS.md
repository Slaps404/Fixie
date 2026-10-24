# Getting the API keys (≈15 min)

Put every value in **`server/.env`** on the T3 box. It already exists, it's gitignored, and the webhook secret is pre-filled. Edit it in T3's file editor or terminal. **Never paste keys into a chat or commit them.**

| # | Service | Steps | Goes into `server/.env` |
|---|---|---|---|
| 1 | **Vapi** (voice agent) | Sign up at [dashboard.vapi.ai](https://dashboard.vapi.ai). Billing → add **$20** credit. Org settings → **API Keys** → copy the **Private** key | `VAPI_API_KEY=` |
| 2 | **Twilio** (phone number) | Sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio). **Upgrade** the account (add $20), which removes the trial limits. Phone Numbers → **Buy a number**: US, local, **Voice** capable (619/858 is nice). Console home → copy the **Account SID** and **Auth Token** | (used in step 3 only) |
| 3 | **Connect Twilio → Vapi** | Vapi dashboard → **Phone Numbers** → Import → **Twilio**. Paste the number, Account SID, and Auth Token, then save. Copy the **Phone Number ID** it shows | `VAPI_PHONE_NUMBER_ID=` |
| 4 | **ElevenLabs** (optional, nicer voice) | [elevenlabs.io](https://elevenlabs.io) → Profile → **API Keys** → create. In Vapi → **Integrations / Provider Keys** → ElevenLabs → paste. Choose a warm voice in the Voice Library and copy its **Voice ID** | `VAPI_VOICE_ID=` |
| 5 | **Anthropic** | [console.anthropic.com](https://console.anthropic.com) → API Keys → create | `ANTHROPIC_API_KEY=` |

After that:
- **Tell Jianan "keys are in."** Don't send the keys themselves. Lane A sets `PUBLIC_URL` and creates the assistant.
- **Every role-play phone** (Dorothy, the warranty line, the suppliers): save the Twilio number as a contact named **"Fixie"**. Turn off **Silence Unknown Callers** and Focus/Do Not Disturb.
- Send Jianan the **role-play phone numbers** in `+1XXXXXXXXXX` format, with who plays which role. They go into `server/data/roster.json`, which is also gitignored.
