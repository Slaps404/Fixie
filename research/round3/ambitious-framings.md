## Verdict
The "wrapper" critique holds for the call-and-diagnose layer. OpenClaw already has phone skills for inbound and outbound calls ([Telnyx](https://telnyx.com/resources/openclaw-phone-calls), [Vapi](https://vapi.ai/blog/openclaw)), so don't pitch that layer. What a personal agent lacks is liability, longitudinal asset state, and outcome data. Pitch those.

## Six framings

**1. Maintenance dept for people without one (a)**
- **One-liner:** A persistent agent that owns every appliance, HVAC unit, and detector in a senior's home. It acts before things break (recalls, filters, heatwave prep, detector batteries).
- **Why a general agent can't:** OpenClaw has cron and heartbeats, so scheduling is not the gap. The gap is a verified asset ledger (model and serial read aloud, warranty status, repair history), recall and part-number lookups, a family-caregiver permission model, and one number a 74-year-old can call.
- **Who pays:** Adult children, Medicare Advantage plans, and aging-in-place programs.
- **Market:** 75% of adults 50+ want to age in place ([AARP 2024](https://www.aarp.org/press/releases/2024-12-10-new-aarp-report-majority-adults-50-plus-age-place-policies-communities-catch-up.html)). Property maintenance is a top-three reason people expect to move. I found no dollar TAM, so that number is unverified.
- **Demo beat:** Skip the clock forward. Fixie calls Dorothy unprompted ("heat advisory tomorrow, your AC filter is 5 months old, I ordered one"). Nobody triggered it.

**2. "Fixed or we pay the pro" (b)**
- **One-liner:** Fixie guarantees the repair and prices that guarantee from its own diagnosis and fix-success data.
- **Why a general agent can't:** A general agent can't take on liability, because it has no loss data to price risk. Fixie's closed loop (diagnose, part, install, verify by callback) produces exactly that data.
- **Who pays:** Consumers pay a premium. Warranty companies and insurers pay for the underwriting signal.
- **Market:** US home warranty providers earn about $4.6B ([IBISWorld](https://www.ibisworld.com/united-states/market-size/home-warranty-providers/4785/)). Global is about $9B ([Business Research Co., via search](https://www.ibisworld.com/united-states/industry/home-warranty-providers/4785/); unverified).
- **Demo beat:** A live price card ("this repair: P(fixed)=0.86, guarantee $4") computed from the eval harness. Then the callback fails, and a pro is dispatched at Fixie's cost.

**3. Autonomous MRO buyer (d)**
- **One-liner:** The same engine, triggered by a J1939 fault, buys parts and service for a fleet, port, or base.
- **Why a general agent can't:** It needs an allowlist, spend caps, audit logs, and integration with the vendor's phone-first processes.
- **Who pays:** Fleet operators, on SaaS plus a share of savings.
- **Market:** The US MRO supplies market is about $907B ([NAW 2024 report, from a search snippet](https://www.naw.org/product/2024-u-s-mro-market-trends-report-construction-facility-mro/); unverified).
- **Demo beat:** The tractor fault fires, and parallel calls return ranked quotes with the kill switch visible.

**4. Repair-economy graph (c)**
- **One-liner:** Every call adds to a shared graph of part, price, and fix-success data. OEMs, insurers, and warranty firms would buy it.
- **Why a general agent can't:** Data exists only if you run the volume. This is a moat claim with zero data today.
- **Who pays:** OEMs, insurers, and warranty firms.
- **Market:** Unverified.
- **Demo beat:** A dashboard that updates after each call ("WP3392519: 4 vendors, $9–$31, 92% fix rate, n=...").

**5. Circular-economy (f)**
- **One-liner:** Each repair is logged with measured e-waste avoided.
- **Why a general agent can't:** It can't, but the pitch is soft, because the CO2 figures are estimates.
- **Who pays:** ESG buyers and municipalities.
- **Market:** 62 Mt of e-waste was generated in 2022, and only 22.3% was documented as recycled ([UNITAR](https://unitar.org/index.php/about/news-stories/press/global-e-waste-monitor-2024-electronic-waste-rising-five-times-faster-documented-e-waste-recycling)).
- **Demo beat:** A "kg diverted" counter. It works as a closing line, not as a business.

**6. Right-to-repair enforcement agent (e)**
- **One-liner:** An agent that calls OEMs to demand parts and manuals under state law.
- **Why a general agent can't:** It can't file legally credible demands.
- **Who pays:** Independent repair shops and advocacy groups (PIRG).
- **Market:** Unverified.
- **Demo beat:** A call to an OEM citing the statute.
- **Scope is narrow:**
  - California SB 244 is in effect since July 1, 2024, and covers electronics and appliances ([Repair.org](https://www.repair.org/iowa) summary; parts-availability periods unconfirmed).
  - Colorado's 2026 law is digital electronics only ([Vermont report](https://legislature.vermont.gov/Documents/2026/Workgroups/House%20Commerce/Intern%20Documents/2026%20Intern%20Documents/W~Bailey%20Davis~Weekly%20Intern%20Report~4-3-2026.pdf)).
  - New York's law is digital electronics only.
  - Minnesota's appears to reach appliances ([compliance summary](https://www.complianceandrisks.com/wp-content/uploads/2026/04/State-by-State-Comparison_-Right-to-Repair-Legislation-Across-the-US.pdf)).
  - A dryer fuse is probably covered only in CA and MN. Your demo is not a strong fit.

## Ranking for these judges and a 3-minute demo
1. **(b), wrapped in (a).** Corgi gets the underwriting angle, and Agentin gets evals as the pricing input. Latted and the Unsupervised track get a long-running proactive agent. The beat is emotional and visual.
2. **(a) alone.** The cleanest story. It is weaker on moat, because OpenClaw can schedule.
3. **(d).** It reuses the port beat and appeals to Meadow, but it dilutes the Dorothy story.
4. **(c).** It is a good slide, not a demo.
5. **(f).** Use it as a closing line.
6. **(e).** Narrow legal fit and a weak demo.

Do not claim real underwriting. Say "simulated pricing from N eval runs." A real guarantee would need a licensed carrier or a state-regulated service-contract structure (unverified).

## Three hardest questions for the top pick
1. **"Where's the loss data? You have n=0."**
   Answer: We have none from real customers yet. We built an eval harness (diagnosis accuracy by appliance and symptom) and show the pricing mechanism, with the numbers labeled simulated. The product starts as a capped, pilot-only guarantee ($9 part, small cap) so loss per claim stays tiny while real data accumulates. Seed the priors from published failure-mode data.

2. **"OpenClaw plus a Vapi skill does the calls. What's yours?"**
   Answer: We don't compete on calling. We compete on three things: the asset ledger, a repair-outcome dataset from callbacks, and bearing the downside. A personal agent won't take liability for a stranger's dryer. We use OpenClaw-style agents as a commodity layer.

3. **"Isn't this an insurance product? You're not licensed."**
   Answer: Agreed. Phase one is a service guarantee, with fix-or-refund capped at the cost of the part and one tech visit. Phase two is a partnership with a licensed carrier or MGA, where our data is the product. That is the Corgi-style path. Counsel review is still needed. Treat this as unverified legal territory.