## 1. TL;DR
- **Build "Fixie," a phone number you call.** You call it and describe the problem. It diagnoses by voice, then calls 2–3 "suppliers" on its own and calls you back with the cheapest quote. Only a spoken "yes" places the order.
- **Tracks:** primary is **No App**, secondary is **Unsupervised**. Supplier calling must show caps, loop and stuck detection, and a stop rule.
- **Stack:** Vapi, plus a paid Twilio number (about $20 upgrade), FastAPI, Claude, and a cached price table. Use Channel3 live if it works for part numbers.
- **Savings come from matching specs, not haggling.** The identical 45/5µF capacitor costs [$15.78](https://www.hnkparts.com/supco-cd45-5-440r-dual-run-capacitor-45-5-mfd-440v-round) at one seller and [$50.69](https://punchout.hdsupplysolutions.com/p/supco-440-volt-45-5-mfd-round-dual-run-capacitor-p252498) at another. A pro visit costs $150–400.
- **Rules for every call:** the agent says it is an AI and that the call is recorded. Supplier numbers are teammates only. Any refrigerant, capacitor or gas work goes to a pro.

## 2. Track + no-screen rule
- **No App (primary):** the main path is voice only. The user reads the model number aloud and the agent reads it back digit by digit. The callback and the order confirmation are by voice.
- **Photos never sit on the main path.** The only photo route is a caregiver texting it, and we pitch that as an accessibility bonus. FaceTime is impossible because there is no API.
- **Unsupervised (secondary):**
  - Caps: at most 8 calls, a dollar budget, 6 minutes per call, a 45-minute job limit.
  - It detects repeated vendor calls, voicemail or IVR loops, and 90 seconds of silence.
  - When stuck, it hangs up, logs it, and calls the user ("couldn't get under $40, keep going?").
  - There is an audit log view for judges only.
- **Check the submission form for whether we can enter one track or two.**

## 3. Judge cheat sheet
| Judge | Co. | Cares about | Hook |
|---|---|---|---|
| Metehan Oz | Latted (also Fume, a background coding agent) | Agents that finish a task and report back | A live budget meter plus one deliberate stop |
| Anis & Leon (remote) | Gutgutgoose | Mechanism, measured outcomes | "$X saved on real quotes," a small diagnosis eval, a 7-day follow-up call. Audio must work over a video link |
| Neel Majmudar | Transpose (organizer, VC) | A company, not a hack | Who pays, and "building Monday" |
| Anamika Khaleghian | Corgi (insurance) | Risk, liability, speed | Safety tiers, a risk log, loop time in minutes |
| Sankeerth Karingula | Agentin (UCSD PhD) | Reasoning, evals | The agent forms a hypothesis, asks the user to run a test, and changes its mind. One accuracy number |
| Punn Kam | Conduit (voice agents, UCSD) | A real production voice agent | A live outbound call with retry and human handoff. He will spot a staged demo |
| Pavan Kumar | Clean (UCSD) | Go-to-market | One-line business model (affiliate cut or home-warranty B2B2C) plus dollars saved |
| Christa Tsao | Meadow (UCSD) | Autonomous commerce | A buyer agent for the consumer; it remembers your appliances and calls before they fail |
| Arjun Vad | Agencity | Factories, emerging markets | Reach to factory and distributor tier, a Spanish or Hindi line, no paid acquisition |

## 4. Stack + architecture
```
Senior phone ─call─> Twilio # (paid) ─> Vapi "Fixie" (Claude Sonnet; AI+recording disclosure; safety tiers)
                                          │ tools: lookup_part, start_sourcing, [check_photo]
                                          v
                               FastAPI server (Cloudflare/ngrok tunnel)
            ┌──────────────┬──────────────┼───────────────────────┐
     parts.json cache  Channel3 API  Orchestrator: caps, budget, loop/stuck   /sms caregiver MMS -> Claude vision
                                          │ POST api.vapi.ai/call x N (persona+part+ceiling)
                                          v
                        Supplier phones (teammates) ─end-of-call-report─> LLM quote extract -> rank
                                          │
                        POST /call callback: "$16 vs $51 retail. Say yes to order."   /log -> projector
```
Plan B is ElevenLabs Agents or Retell on the same Twilio number. Retell documents IVR navigation; Vapi's IVR support is unclear.

## 5. Slice plan (owners: A = voice, B = backend, C = data/personas, D = pitch/QA)
| # | Time | Adds | Owner | Done when |
|---|---|---|---|---|
| 0 | 45m | Inbound call, `start_sourcing`, one outbound call to a teammate, canned callback | A+B | One call in produces a supplier call and a callback, with nobody touching a laptop |
| 1 | 45m | Diagnosis loop (hypothesis and test), model readback, Tier A/B/C prompt, 2–3 preloaded appliances | A | A stranger describes "AC blowing warm" and gets the right part plus the "pro installs" escalation |
| 2 | 45m | 2–3 supplier calls, transcript to JSON quote, ranking against cached retail baseline | B+C | Quotes logged correctly and the cheapest is spoken in the callback |
| 3 | 40m | Call and dollar caps, voicemail or IVR timeout, loop detection, escalation call, `/log` view | B+D | A simulated voicemail is skipped and hitting a cap triggers "keep going?" |
| **CUT LINE (~5:15): demo this if time runs out** | | | | |
| 4 | 30m | Callback read-back, spoken "yes," $100 cap, caregiver call | A | A "yes" is recorded with item, total and seller |
| 5 | 30m | Caregiver photo to model number, live Channel3, Spanish line | C | One live lookup works |
| 6 | parallel | **Backup video recorded by 5:30**, 3 rehearsals, submit by 6:15 | D | 3 clean runs on venue network |

Never cut the callback or the guardrail beat.

## 6. Demo (3 min)
- **0:00** Hook: "Grandma's AC died at 112°F. She has a flip phone."
- **0:15** Live call. Use a headset or a phone at the ear fed to the PA, not a speakerphone, because echo causes false interruptions.
  - The agent checks the breaker and thermostat battery, takes the model number read aloud, and diagnoses the capacitor.
  - It says: "That's a pro install, but I'll get the part cheapest."
- **1:00** Live outbound call to a teammate supplier, who quotes $50. A second supplier quotes $16 for the same spec. The projector log shows calls, spend and quotes.
- **2:00** A third "supplier" is a voicemail or IVR loop. The agent says "stuck, skipping."
- **2:20** The callback rings: "$16 versus $51 retail, install-only pro saves about $150. Say yes." The user says yes.
- **2:45** Close: who pays, scale beyond the US, building Monday.

**Fallbacks:**
- The pre-recorded video.
- A dry-run mode that plays supplier audio clips.
- A hotspot.
- Verify every demo phone, including the judge's, in Twilio.
- Second teammate number if the first supplier doesn't answer.

## 7. Guardrails to pitch
- **Disclosure:** the first sentence of every call says it is an AI and asks consent to record. This covers the [FCC 2024 TCPA AI-voice ruling](https://www.cooley.com/news/insight/2024/2024-02-15-fcc-ai-generated-robocalls-illegal-under-the-tcpa) and California all-party consent (Penal Code 632/632.7).
- **Calls to businesses:** quotes and information only, never marketing. Honor "stop calling," retry at most twice, business hours only.
- **Tier C goes to a pro:** refrigerant ([EPA 608](https://www.epa.gov/section608/prohibition-venting-refrigerants)), capacitors, gas (smell of gas means "leave, call 911"), microwaves, smoke, and a confused-sounding user.
- **Money:** spoken confirmation, $100 cap, single-use virtual card, full audit trail.
- **Warranty:** Magnuson-Moss means doing your own repair doesn't automatically void the warranty ([FTC](https://www.ftc.gov/node/54283)).
- **Trust:** no commission bias and no card up front. This is the opposite of a home-repair scam.

## 8. Top 5 stats
1. Appliance repair averages **$179**, HVAC **$350**, and service-call fees alone run **$100–250** ([HomeAdvisor](https://www.homeadvisor.com/cost/kitchens/repair-an-appliance)).
2. The identical capacitor costs **$15.78 vs $50.69**, and a pro install costs $150–400 ([This Old House](https://www.thisoldhouse.com/heating-cooling/ac-capacitor-cost)).
3. Adults 60+ reported **$3.0B in fraud losses in 2025**, 5x 2020 ([FTC](https://www.ftc.gov/news-events/news/press-releases/2025/12/ftc-issues-annual-report-congress-agencys-actions-protect-older-adults)).
4. About **22% of US adults 65+ have no smartphone** ([Pew](https://www.pewresearch.org/technology/2025/tech-adoption); 78% ownership seen only on secondary sites, verify).
5. **3.1B people** live under mobile coverage but don't use mobile internet ([GSMA](https://gsma.com/newsroom/press-release/gsma-calls-for-renewed-focus-on-closing-the-usage-gap-as-more-than-3-billion-people-remain-offline-despite-available-mobile-internet-services/)).

## 9. Open questions
- Can we submit to one track or two?
- Demo appliance: AC capacitor (big price spread, but install goes to a pro) or dryer thermal fuse (Tier B DIY, plus the vent warning)?
- Use the judge's phone (needs verifying) or a teammate's phone?
- Twilio paid upgrade and Vapi credit: who pays?
- What did the teammate mean by the "old PCB thing"? A board-photo mode is one guess.
- Do we attempt the multilingual line?

## Conflicts / unverified
- **Photo input:** the parts and voice reports make it central; the design report says it breaks the no-screen rule. Decision: caregiver-only and optional.
- **Capacitor:** one report says "discharge it and DIY"; the legal report says hard escalate. Escalate.
- **Negotiation:** there is no evidence that calling by phone gets a better price. Savings come from aftermarket and spec matching, so pitch it honestly.
- **Speakerphone:** the demo script uses it; the voice report says don't.
- **SB 244:** coverage of appliances, ACs and mowers is unverified, and PIRG says right-to-repair laws cover electronics only. Don't claim it on stage.
- **Heat-death stat:** the "2012 CDC" figure is cited through a 2005 article, so drop it.
- **Pew 78%** is secondary only.
- **Corgi's $4B valuation** is unconfirmed.
- **Metehan Oz:** YC lists him as CTO of Fume, not Latted.
- **Disputed details:** Vapi's free credit amount and Amazon PA-API's deprecation date.
- **Inferred judge values:** most judge preferences are guessed from their companies, not sourced.