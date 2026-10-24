# Lane B checklist (human-only tasks): Fixie

## ⚡ 1. API keys → `server/.env` (follow `docs/KEYS.md`)
**Keys go straight into `server/.env` on the T3 box** (gitignored). Never paste them into any chat, including Claude, and don't send them to Jianan.
- [ ] Vapi: add $20 credit → **Private** API key → `VAPI_API_KEY=`
- [ ] Twilio: paid upgrade + 619/858 Voice number ✅
- [ ] Vapi → Phone Numbers → Import → Twilio. Paste the **Account SID (`AC…`) + Auth Token** into the Vapi form only. Copy the Phone Number ID → `VAPI_PHONE_NUMBER_ID=`
- [ ] Optional: ElevenLabs key into Vapi → Provider Keys; Voice ID → `VAPI_VOICE_ID=`
- [ ] Anthropic key → `ANTHROPIC_API_KEY=`
- [ ] Tell Jianan **"keys are in"** (no keys in the message).
- [ ] ⚠️ The Twilio API key (`SK…`) pasted in chat earlier: **delete it** in Twilio Console → API keys & tokens.

## ⚡ 2. Recruit role-play phones (3–4)
Scripts are in `pitch/roleplay-scripts.md`. Fill in the table at the top.
- [ ] **Whirlpool Parts & Warranty**: you?
- [ ] **PartsDirect Counter**: friend #1 (front row, audible)
- [ ] **Valley Appliance Parts**: friend #2 (quotes $55 + $4 → budget guard)
- [ ] **Coast Supply**: friend #3 (declines the call → no-answer guard)
- [ ] **Dorothy**: Jianan's phone
- [ ] Optional **Hold** actor (answers, then goes silent → stuck guard)
- [ ] Send Jianan all the numbers as `+1XXXXXXXXXX` **with roles** (they go in `server/data/roster.json`). Phone numbers aren't secrets, but keep them off the repo.
- [ ] Each person does the phone prep in the script (**Silence Unknown Callers OFF!**)
- [ ] Each person is at the **4:00 PM MPR test call**, at rehearsals around 5:30, and has their phone in hand from **7:40 PM**.

## ⚡ 3. Part facts
Claude is researching these into `pitch/part-prices.md`. You just spot-check 2–3 ⚠️ links in a real browser.

## 4. Ask an organizer (Neel, Punn, Christa, or Arjun)
> "Can we enter multiple tracks: No App, Unsupervised, **and** Dispatch? Our project is a phone-only repair agent that also triggers from equipment fault codes."

- [ ] Answer: ________ → post it in the group chat.

## 5. Optional: real parts counter test (great stage line)
Call 1–2 real San Diego appliance parts counters **as yourself**. Don't pretend to be an AI or use the agent.
> "Hi, quick question. I'm building an AI assistant that calls parts counters to check price and stock for a customer. It says up front that it's an AI. If it called you asking for a Whirlpool thermal fuse, WP3392519, would you give it a quote?"

Candidate counters: search "appliance parts San Diego" (e.g. Marcone/Appliance Parts Co., local counters on Convoy St / Kearny Mesa).
- [ ] Counter 1: ________ said ________
- [ ] Counter 2: ________ said ________
- [ ] Bonus: ask their price for WP3392519 → add it to `part-prices.md`.

## 6. Demo logistics
- [ ] Bring a **hotspot**.
- [ ] Headset or earbuds for Dorothy. **No speakerphone.**
- [ ] Laptop + HDMI/USB-C adapter for the board.
- [ ] Prop: a printed dryer sticker reading `WHIRLPOOL  MODEL WED4815EW  SERIAL C91234567`.
- [ ] Optional prop: a real thermal fuse ($9) to hold up during the install beat.

## 7. Backup video (by 5:30)
- [ ] Do a full run. Screen-record the board **with system + mic audio** (QuickTime / Cmd-Shift-5 / OBS).
- [ ] Worst case: `web/serve.sh`, then `?replay=1` replays the real `events.jsonl` from rehearsal, or `?mock=1` plays the scripted run.
- [ ] Upload unlisted to YouTube or Drive, and check the link in an incognito window.

## 8. Submission (by 6:20)
- [ ] Write-up from `pitch/demo-script.md` (problem line, how it works, tracks, guardrails).
- [ ] Repo link + video link + tracks.
- [ ] **Both** teammates registered on Luma.
- [ ] Screenshot the confirmation.
