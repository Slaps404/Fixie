**Verdict:** Rank by how well each item shows something a general agent with a phone skill can't do. Sensors in the loop and verified, auditable reasoning are the moat. Acoustic AI is the riskiest claim.

## Ranked build list (about 5 hours total)
1. **(4) Power-signature trigger**, 1.5h. Wow: high. Honesty risk: low.
2. **(2) Guided multimeter measurement with a live hypothesis**, 1.5h. Wow: high. Honesty risk: low.
3. **(5) Recall match**, 45 min. Wow: medium. Honesty risk: low.
4. **(7) MMS nameplate**, 45 min. Wow: medium. Honesty risk: low.
5. **(6) Repair-vs-replace**, 30 min. Wow: low, but it makes the agent look like it has judgment.
6. **(3) Cross-reference graph**, a small hardcoded demo only.
7. **(1) Acoustic**, a labeled experiment only. Do not make it the headline.

## 1. Acoustic diagnosis over the phone (skip as headline)
- **Datasets and benchmarks exist.** [ToyADMOS](https://ar5iv.arxiv.org/html/1908.03299) and [MIMII](https://zenodo.org/record/7687464) cover industrial and miniature-machine sounds. DCASE Task 2 is the standard anomalous-sound-detection benchmark, and [AudioICL-Bench](https://arxiv.org/pdf/2609.11252) has an anomaly task.
- **No zero-shot result found.** I found no published result for Gemini or Claude on zero-shot appliance fault classification. A Google forum thread reports inconsistent results, and Firebase docs warn the model "might make mistakes" on non-speech sound ([source](https://firebase.google.com/docs/ai-logic/input-file-requirements?api=vertex)). Claude has no native audio input that I verified. Treat this as unverified.
- **Phone audio is a poor channel.** It is about 8 kHz, band-limited to 300–3400 Hz, and codec-compressed ([source](https://soniox.com/wiki/telephony-transcription)). That removes the high-frequency content used for bearing whine and similar faults. Vapi's noise suppression may also remove the dryer sound (unverified).
- **Feasible demo (about 1h).** Pull the call recording from the Vapi `end-of-call-report` artifact (`recordingUrl` / `stereoRecordingUrl`). Vapi's July 2026 notes say per-track downloads exist ([release notes](https://releasebot.io/updates/vapi)). Send the audio as inline audio to Gemini's `generateContent` with a closed-set prompt: squeal, rumble, thump, silence, or running without heat.
- **Do not claim "AI hears your fault."** Say "audio is one weak prior, and a tech-verified test confirms it." A dryer that runs but doesn't heat sounds normal, so this wouldn't catch the demo fault.

## 2. Guided measurement by voice (strongest "not API glue" beat)
- **Build.** Hold a small hand-authored fault tree for the dryer with priors, for example thermal fuse, heating element, thermostat, or igniter. The agent asks Dorothy to read the multimeter ("touch the probes to the two fuse terminals, what does it say?").
- **How it works.** A Claude tool call `update_beliefs(test, reading)` applies likelihood tables you wrote. Pick the next test by expected information gain per safety cost. Show the posterior on a side panel or in logs.
- **Safety.** Gate each step on "unplugged". Continuity tests only. Never give live-voltage steps.
- **Honesty.** The priors are authored, not learned from data. Say so, and call it "sequential Bayesian diagnosis over an expert-written tree."
- **Why it beats a personal agent.** It has a quantified, auditable belief state and picks the cheapest discriminating test. It fits the Agentin-style eval angle: log the posterior per turn.
- **Build time.** About 1.5h, mostly the tree JSON and the tool schema.

## 3. Parts cross-reference graph (partial)
- **What exists.** Retailer pages show supersession and cross-references for WP3392519. [Whirlpool](https://www.whirlpoolparts.com/PartDetail/Thermal-Fuse/WP3392519/2986) lists replaces 3392519, 80005, 694511, 3388651 and ET401. [eReplacementParts](https://www.ereplacementparts.com/parts/dryer/whirlpool/erp11741460/dryer-thermal-fuse-wp3392519/) adds AP6008325 and WP3392519VP. The temperature rating differs by source: 196°F on Whirlpool's page, 195°F at [Sears PartsDirect](https://www.searspartsdirect.com/product/504y9afdt5-0026-464/id-wp3392519). That is why the agent must confirm fit instead of guessing.
- **Open data.** I found no open exploded-diagram or supersession dataset, and I did not verify PartSelect's structure. Scraping at a hackathon carries ToS risk.
- **Build.** A hand-curated JSON of about 10 part numbers. Each supplier call asks for any alias, and the ranking treats aliases as the identical part. About 45 min.
- **Honesty.** Call it "alias-aware matching on a curated set". Do not claim a full graph.

## 4. Smart-plug power signature (best proactive wow)
- **Shelly Plug S Gen3.** It has a local HTTP RPC (`/rpc/Switch.GetStatus?id=0`) that returns `apower`, `voltage` and `current` ([docs](https://shelly-api-docs.shelly.cloud/gen2/Devices/Gen3/ShellyPlugSG3)). A Plug S is rated for roughly a 16A load, which is not a US 240V dryer circuit (rating from memory, not verified). Use it on a hairdryer, a space heater, or a mock dryer.
- **Sense.** No official public API, only [unofficial clients](https://pypi.org/project/sense-energy/). One README claims Sense stopped selling monitors at the end of 2025, from a single source. Skip Sense.
- **Emporia Vue.** It has an [unofficial PyEmVue](https://pypi.org/project/pyemvue/). It supports DAY and coarser scales (HOUR and lower unsupported), so it can't do real-time detection. Skip it.
- **Build.** Poll every 2s. Rule: drum motor ~300W for 5 minutes with no heater step of 4–5kW means "runs but doesn't heat". This is a rule-based detector, not true disaggregation. Then Vapi outbound fires: "Dorothy, your dryer has been running 10 minutes with no heat. Want me to fix it?"
- **Demo risk.** Unplug a hairdryer's heat setting live, or replay a recorded CSV as a fallback. Say "simulated signal" in the pitch.
- **Why it beats a personal agent.** It acts before the user knows there's a problem, and the call comes from a measured fault. Pitch it as "a trigger, not a prompt".

## 5. CPSC recall matching
- **Confirmed endpoint.** `https://www.saferproducts.gov/RestWebServices/Recall?ProductName=dryer&format=json`. It needs no key. Parameters shown: `Title`, `RecallDescription`, `ProductName`, `format=json` ([CPSC docs](https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information)).
- **Caveat.** An Apify actor reports the `Hazard` parameter returned no matches as of 2026-09-04 ([source](https://apify.com/zeekr011/us-cpsc-monitor.md)). Filter hazards client-side.
- **Vehicles.** NHTSA is `https://api.nhtsa.gov/recalls/recallsByVehicle?make=&model=&modelYear=` (from memory, unverified).
- **Build (45 min).** Store the model and brand from the OCR step. Query by brand and product, then have Claude judge whether the recall covers that model. Never state "no recalls" with certainty. Say "none found in CPSC's database for those terms".

## 6. Repair-vs-replace
- A small function: repair cost against replacement cost times remaining life. Use the $9 part against the $200 visit for the demo. All inputs are user-stated or assumed, so label the output an estimate. About 30 min.

## 7. MMS nameplate OCR (no app)
- **Twilio MMS.** An inbound MMS posts `MediaUrl0` and `MediaContentType0` to your webhook ([tutorial](https://twilio.com/docs/messaging/tutorials/how-to-receive-and-download-images-incoming-mms/node)). Whether the media URL needs credentials to fetch is unverified.
- **Claude vision.** Send the image as a base64 or URL `image` content block ([docs](https://platform.claude.com/docs/en/build-with-claude/vision)). Ask for strict JSON: `{brand, model, serial, confidence, unreadable_chars}`.
- **Honesty.** I found no accuracy data for glared or worn plates. Always read the model back by voice for confirmation ("I read W-H-1-2-3, is that right?"). A US 10DLC or toll-free number must be verified before MMS works (from memory, unverified). This also covers Dorothy's "read the sticker aloud" fallback.

## Pitch line
"A personal agent can place a call. Fixie measures, reasons over a belief state it can show you, and acts before you notice. Every claim here is simulated or labeled as such."