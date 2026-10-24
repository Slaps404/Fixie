# #13 (Round 3, after #11 and #12) Quick wins, in order; stop at freeze
**Owner:** Lane A · Each is self-contained. Source: `research/round3/SYNTHESIS.md` §4.3–4.5, `agent-commerce-network.md`.

1. **Second quote round (20 min).** After the first round, call back the runner-up: "Another supplier quoted $8.40 for the identical part. Can you beat it?" Emit `quote{round:2}` and the price delta. Say "compares quotes", never "negotiates hard".
2. **Caregiver co-sign over $50 (15 min).** When the best landed total is above `CAREGIVER_COSIGN_USD=50`, text the caregiver (roster `caregiver`) "Reply YES to approve $X for Mom's dryer part". The order stays blocked until the reply arrives (`POST /sms` Twilio webhook, or a board button in sim). Emit `guard{kind:'cosign', action:'held'|'approved'}`. Pairs with #8.
3. **CPSC recall check (45 min).** At diagnosis, `GET https://www.saferproducts.gov/RestWebServices/Recall?ProductName=dryer&format=json` (cache the response, with a 3 s timeout). Filter client-side for brand + model (the Hazard parameter is reportedly broken), and have Claude judge whether any recall covers this exact model. Emit `recall_check{found, title?, url?}`. Script: "I checked the CPSC recall database and found none for your model." Never say "no recalls exist".

**Skip (decided):** acoustic diagnosis (8 kHz audio, and no-heat sounds normal), smart-plug trigger (240V circuit), escrow, Visa/Mastercard agent pay, and Stripe SPT unless sandbox access works in the first 10 minutes.
