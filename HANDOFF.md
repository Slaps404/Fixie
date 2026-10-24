# Handoff: Fixie at c0mpiled-16 UCSD (2 people, parallel lanes)

**Event:** c0mpiled-16 UCSD, theme "Invisible Interfaces" (https://luma.com/compiled-im3b)
**Hard deadlines:** submissions due **6:30 PM**, top 5 at 7:45 PM, top 5 demos 7:45–8:15 PM
**Tracks:**
- **No App:** users never need to look at a screen.
- **Unsupervised:** a multi-day agent with caps, loop/stuck detection, and a stop rule.
- **Dispatch:** add it if the port beat ships. Check the submission form for multi-track entry.

## The product: **Fixie**, an AI voice support line for any physical hardware
> "Assistants tell you how to fix it. Fixie gets the part on its way, then walks you through installing it."

**One engine, two markets.**

**Consumer demo (hero):** Dorothy, 74. Her **dryer runs but won't heat**. She calls one number from any phone.
1. **Diagnose by voice.** Fixie asks a few questions and has her read the model sticker aloud, then reads it back. Likely culprit: a blown **thermal fuse** (Whirlpool/Kenmore, e.g. WP3392519). It warns her to clean the vent too.
2. **Safety gate.** The repair is DIY-safe once the dryer is unplugged. Gas, refrigerant, or high-voltage repairs are escalated to a pro.
3. **Warranty first.** Fixie calls the "manufacturer warranty line" (a teammate plays it) to check whether the part is free.
4. **If not covered, source it.** Parallel calls to 2–3 "suppliers" (teammates/friends). It compares quotes for the **identical part** and picks the cheapest.
5. **Callback:** "Found it for $9 versus a $200 tech visit. Arrives Tuesday. Say yes to order." She says yes, and the order is mocked.
6. **Delivery call.** On a "package delivered" event, Fixie calls: "Your part arrived. Want to install it together?" Then a step-by-step voice walkthrough, and a check that it worked ("Is it warm now?").
7. **Guardrails, all enforced in code:** call/minute/dollar caps, an approved-vendor list, voicemail/loop/stuck detection → stop and call the user.

**Enterprise beat (30 sec, after the cut line):** a port terminal tractor throws a J1939 fault code (`POST /fault` fired with curl on stage). The same engine calls the tech and sources the part before the ship's berth window. Defense angle: base HVAC uses off-the-shelf parts (the Army HVAC task force was created Oct 15, 2026).

**Judges watch a live board. The user never sees a screen.**

**Stack:**
- TypeScript/Node backend (`server/`)
- **Vapi** for the voice agent, outbound calls, and tool webhooks
- A **paid Twilio number** imported into Vapi (free Vapi numbers can't make outgoing calls)
- Claude/OpenAI for reasoning, ElevenLabs voice (optional)
- Cloudflare/ngrok tunnel

**Research:** `research/PLAN.md` (judges, stats, guardrails, demo gotchas) and `research/round2/POSITIONING.md` (differentiation vs Google, Meta, ChatGPT, and Grok; enterprise verticals; hard judge Q&A).

**Pitch honesty rules:**
- Say "compares quotes", not "negotiates".
- Never say "Google can't call businesses". Google can, from Search, for local services. We call distributors by part number, from any phone, with a safety gate and a spoken-yes order, and we follow through to the install.
- Every call opens with "I'm an AI assistant; this call is recorded."

---

## Lane A: Jianan + Claude (backend / agent), in `server/`
| Slice | Target | Done when |
|---|---|---|
| 0 | 3:30 | Inbound call → dryer diagnosis → `start_job` tool hits our server → event appears on `/events` |
| 1 | 4:15 | Warranty call + parallel supplier calls (outbound to teammate phones); quotes extracted and ranked; guards enforced |
| 2 | 4:45 | Callback to user with a spoken yes → mocked order |
| 3 | 5:10 | `POST /simulate/delivered` → arrival call → voice install walkthrough + fix check |
| **CUT LINE (5:10)** | | |
| 4 | 5:30 | `POST /fault` (port tractor J1939) → same engine |
| — | 5:30 | **Feature freeze.** Record the backup video. |

## Round 3: differentiation (queued after the current review/verify round)
Research: `research/round3/SYNTHESIS.md`. Answer to "isn't this just OpenClaw?": concede the calls, claim the closed loop, guardrails enforced in code, and the "fixed, or we pay the pro" story.
| # | Issue | Lane | Est | Priority |
|---|---|---|---|---|
| 11 | `docs/issues/11-bayesian-diagnosis.md`: multimeter test, probability bars move | A (+B bars) | 90m | DO NOW |
| 12 | `docs/issues/12-proof-panel.md`: "agent proposes, code approves" + live STOP | B (+15m A) | 75m | DO NOW |
| 13 | `docs/issues/13-quick-wins.md`: 2nd quote round → caregiver co-sign → CPSC recall | A | 20/15/45m | if time |
| 14 | `docs/issues/14-pitch-reframe.md`: pitch + Q&A rewrite | B | 30m | DO NOW |

## Lane B: Friend (human bandwidth + their own Claude thread)
Items marked ⚡ unblock Lane A. Do them first and post results in the group chat.

1. ⚡ **Accounts and keys (now).**
   - **Vapi** account → API key.
   - **Twilio**: upgrade to paid (~$20), buy 1 US local voice number, then in Vapi go to Phone Numbers → Import Twilio.
   - **ElevenLabs** key (optional).
   - We'll pay for credits as needed. Send keys to Jianan **privately**; never paste them in shared chat or commit them.
2. ⚡ **Role-play phones.** We need **3–4 phones** that will answer during the demo: the warranty line, 2 suppliers, and Dorothy, who can be Jianan's phone. Recruit friends if needed. Write short scripts in `pitch/roleplay-scripts.md`:
   - **"Whirlpool Parts & Warranty":** out of warranty, no free part.
   - **"Valley Appliance Parts":** $18, in stock.
   - **"PartsDirect Counter":** $9, ships Tuesday.
   - Optional **voicemail**, to show the stuck-detection guard.
3. ⚡ **Hero part facts (by 3:15).** **Dryer thermal fuse** for a common Whirlpool/Kenmore electric dryer (e.g. WP3392519 / 3392519). Find real prices from 4–5 sources, the typical tech visit cost for "dryer not heating" in San Diego, and the steps of the 15-minute DIY install (unplug, rear panel, multimeter continuity, swap, vent clean). Put it in `pitch/part-prices.md` with links. Lane A uses this data.
4. **Ask an organizer** (Neel, Punn, Christa, or Arjun): can we enter multiple tracks (No App + Unsupervised + Dispatch)? Report the answer.
5. **Optional:** call 1–2 real San Diego appliance-parts counters as yourself and ask whether they'd quote an AI assistant by phone. Cite the result on stage.
6. **Judge board** in `web/` (with your Claude thread):
   - Single static `index.html` with no build step.
   - Call lanes with live transcripts.
   - A quote table that highlights the cheapest identical part.
   - Guardrail meters (calls, minutes, $ budget).
   - A "money saved" counter.
   - A "Simulate delivery" button (`POST /simulate/delivered`).
   - Build it on `web/mock-events.json` (`?mock=1`), then switch to `http://localhost:3000/events`.
7. **Pitch** (`pitch/`): a 3-minute demo script with the run order "dryer call → warranty/supplier calls on board → callback + yes → delivery call → port fault (30s) → close". Include the 5 stats, the 30-second pitch from `research/round2/POSITIONING.md` §6 (rewrite it for the dryer), and the hard Q&A.
8. **Backup video by 5:30.** **Submit by 6:20.** Confirm both teammates are registered on Luma.

**Lane rules:**
- You own `web/` and `pitch/`; Lane A owns `server/`.
- No secrets in files. `.env` files stay local.

## Interface contract: `GET /events` (SSE) and `GET /events.json` (polling)
```json
{ "ts": "2026-10-24T15:02:11Z", "jobId": "job_1", "type": "<type>", "data": { } }
```
| type | data |
|---|---|
| `call_started` | `{ "callId": "…", "lane": "user" \| "warranty" \| "supplier" \| "delivery" \| "tech", "party": "Dorothy" \| "Valley Appliance Parts", "phone": "…" }` |
| `transcript` | `{ "callId": "…", "speaker": "agent" \| "user" \| "supplier", "text": "…" }` |
| `call_ended` | `{ "callId": "…", "reason": "completed" \| "voicemail" \| "no_answer" \| "timeout" }` |
| `diagnosis` | `{ "appliance": "Whirlpool WED4815EW dryer", "issue": "Blown thermal fuse", "confidence": 0.82 }` |
| `safety` | `{ "level": "diy" \| "diy_with_caution" \| "pro_required", "reason": "…" }` |
| `part_identified` | `{ "part": "Dryer thermal fuse", "partNumber": "WP3392519", "crossRefs": ["3392519"] }` |
| `warranty` | `{ "covered": false, "detail": "Out of warranty (purchased 2019)" }` |
| `quote` | `{ "supplier": "…", "price": 9.0, "inStock": true, "eta": "Tuesday", "identicalPart": true }` |
| `best_deal` | `{ "supplier": "…", "price": 9.0, "techVisitCost": 200.0, "saved": 191.0 }` |
| `guard` | `{ "kind": "budget" \| "max_calls" \| "minutes" \| "loop" \| "stuck" \| "voicemail" \| "vendor_not_approved", "action": "skipped" \| "stopped" \| "escalated", "detail": "…" }` |
| `order_confirmed` | `{ "supplier": "…", "price": 9.0, "confirmedBy": "voice" }` |
| `delivered` | `{ "carrier": "UPS", "partNumber": "WP3392519" }` |
| `install_step` | `{ "step": 3, "of": 7, "text": "Remove the two screws on the rear panel" }` |
| `fix_verified` | `{ "ok": true, "detail": "Dryer heating" }` |
| `fault` | `{ "asset": "Terminal tractor YT-07", "code": "SPN 3226 FMI 4", "site": "Port of San Diego, 10th Ave Marine Terminal" }` |
