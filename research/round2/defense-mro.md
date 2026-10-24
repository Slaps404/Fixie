**Defense MRO / parts sourcing as an enterprise market for Fixline (Oct 24, 2026)**

## Market pain (current numbers)
- **Air Force:** AFMC's commander says "we have a $14 billion hole in supply." Supply-related aircraft downtime is up 87% in seven years. About 53% of the fleet is over 30 years old, and AFMC wants about 5 industry sources per critical part ([Defense News, Sep 2026](https://defensenews.com/news/your-military/2026/09/18/us-air-force-has-a-14-billion-supply-hole-service-officials-say)).
- **F-35:** From FY21 to FY25, mission-capable rate fell 67% to 44%, and full mission-capable fell 38% to 25%. GAO links the decline partly to scarce parts and corrosion ([Military Times on GAO-26-108113](https://www.militarytimes.com/industry/techwatch/2026/06/12/only-1-in-4-f-35s-is-fully-mission-capable-gao-finds/), [GAO](https://www.gao.gov/products/GAO-26-108113)). I read this only through secondary coverage.
- **Cannibalization:** GAO-25-107468 (Sep 2025) covers the F/A-18, F-35, LCS, Stryker and Virginia-class. Missing data rights lock the Navy into vendors, so maintainers strip grounded jets and other subs. One F/A-18 radio could not be repaired because the cables came only from the OEM. Reverse engineering was judged too costly ([Defense News](https://www.defensenews.com/news/your-navy/2025/10/08/navy-cannibalizing-materiel-for-spare-parts-watchdog-says/)).
- **Older cannibalization data:** GAO-02-86 reported about 850,000 Air Force and Navy cannibalizations over FY96-00, roughly 154k to 176k per year, and likely undercounted ([GAO-02-86](https://www.govinfo.gov/content/pkg/GAOREPORTS-GAO-02-86/html/GAOREPORTS-GAO-02-86.htm)). I found no current service-wide rate.
- **DMSMS:** Electronics are the main driver. One estimate says 70% of electronics DoD buys are obsolete before fielding ([Inside Defense](https://insidedefense.com/share/209576)). Many legacy parts have no NSN at all. One obsolescence event "can cost millions and take years" ([Defense One sponsored, D&G](https://www.defenseone.com/sponsors/2026/03/dmsms-silent-goliath-threatening-us-military-readiness/412411/)). That source is vendor-sponsored.
- **Base facilities:** Deferred maintenance is about $280B+. GAO's 2023 barracks review found all 10 sites visited had broken or missing HVAC ([Air & Space Forces](https://www.airandspaceforces.com/minot-andersen-facilities-crumbling-as-military-building-repairs-lag-gao-says/), [Military Times 2023](https://www.militarytimes.com/news/your-military/2023/09/20/poor-oversight-leaves-military-barracks-in-dire-condition-report-says/)).
- **Army HVAC task force:** Created Oct 15, 2026. HVAC is the top soldier quality-of-life complaint. Thousands lost AC on Oahu this summer, Fort Hood went 5 to 6 weeks without AC last year, and Fort Carson soldiers slept in cars ([Defense News](https://www.defensenews.com/news/your-military/2026/10/15/acting-us-army-secretary-creates-task-force-for-hvac-repairs/)). That article says nothing about parts sourcing, so the gap is open.

## How parts get sourced
- **Channels:** DLA manages roughly 5M items. Parts flow through NSN/FLIS catalogs, OEM or prime vendors, brokers and distributors, and depot or cannibalized stock. Additive manufacturing and reverse engineering are used for orphaned parts.
- **3D printing example:** A discontinued Army hatch plug had a 3-month lead time and cost $10K. It was printed in days ([Eureka](https://eureka.mydigitalpublication.co.uk/may-june-2025/page-10)).
- **Policy:** Hegseth directed the Army to seek right-to-repair terms ([All3DP](https://all3dp.com/4/u-s-armys-new-right-to-repair-mandate-could-ignite-demand-for-3d-printed-spare-parts/)). Policy still discourages short-notice small-lot spares for Abrams ([Breaking Defense](https://breakingdefense.com/?p=76503)).

## Who is already attacking it
- **DLA internal AI:** About 185 to 190 "digital employees," 90 to 95% unattended. They saved an estimated 300k hours in 2025. DLA is building persona-based access scoped to each job ([Defense One](https://www.defenseone.com/technology/2026/09/digital-employees-are-coming-defense-logistics-agency/415947/)). That article describes no deployed procurement agents, only a hypothetical one.
- **DLA forecasting:** Demand-planning accuracy is about 60%, with an 85% goal ([Federal News Network](https://federalnewsnetwork.com/defense-main/2026/01/dla-turns-to-ai-ml-to-improve-military-supply-forecasting/)).
- **Maintainer tooling:** MetroStar's Iris at Travis AFB combines genAI, wearables and live video to experts, plus a logbook ([Defense Post](https://thedefensepost.com/2026/07/22/usaf-ai-aircraft-maintenance/)). The article doesn't mention voice or parts ordering. PRISMA, a voice-forward job aid, is only a proposal ([NCMS](https://ncms.org/?p=51559)).
- **Commercial MRO:** AeroParts-AI signed a parts-sourcing deal with Joramco ([ePlane](https://www.eplaneai.com/pt/news/joramco-signs-aircraft-parts-sourcing-agreement-with-aeroparts-ai-at-mro-americas)).
- **Gaps in my search:** I found no funded startup doing voice-first, outbound-calling parts sourcing for defense. That is an absence in my results, not proof. I could not confirm funding for Govini, Rune or similar companies.

## Answer to the "just ask Grok/ChatGPT/Meta glasses" objection
Those tools advise. They don't source parts. DoD staff already get Gemini, ChatGPT and Grok on GenAI.mil for sensitive but unclassified (CUI) work (Defense One, above). The shortage is the part, not the diagnosis. Fixline's moat is the outbound action: phoning suppliers, handling quotes and lead times, and getting a spoken approval. No chatbot or pair of glasses makes those calls.

## Constraints
- **ITAR/CUI:** Keep the pilot to COTS and non-ITAR parts. Never accept technical data by voice.
- **CMMC:** Sources conflict on the Phase 2 date of Nov 10, 2026. Smithers reports DoD paused it July 13, 2026, with Phase 1 self-assessment still in force ([Smithers](https://www.smithers.com/resources/2026/august/cmmc-level-2-requirements-and-2026-updates)). Verify before claiming anything.
- **Classified networks:** Out of scope. Phone and PSTN is a feature on unclassified networks.
- **Vapi/Twilio:** Not FedRAMP-authorized as far as I know. Pitch commercial and installation-facilities use first.

## Realistic wedge
1. **Base facilities HVAC and utilities, plus National Guard armories and motor pools.** These are COTS parts, which avoids ITAR. The Army's HVAC task force is a live buyer.
2. **Field vehicle and generator COTS parts** (filters, belts, compressors, batteries).
3. **Later:** NSN cross-reference to commercial equivalents.

## Three pitch-ready stats
1. "$14 billion hole in supply," and supply-caused aircraft downtime up 87% in 7 years (AFMC, Sep 2026).
2. F-35 full mission-capable rate fell from 38% to 25% in four years (GAO, Jun 2026).
3. The Army launched an HVAC task force on Oct 15, 2026, nine days ago. Soldiers sleep in cars while AC parts are sourced slowly.

## Use-case narrative
A Guard maintainer at Camp Pendleton has a dead HVAC compressor in a barracks during a heat spike. His hands are greasy, the shop is loud, and he has no laptop. He calls one number and says "Carrier 38AKS, compressor seized." Fixline checks the safety gate (refrigerant and high-voltage work goes to a certified tech). It calls three distributors, gets the cheapest identical part, and rings back: "Compressor, $412, arriving Tuesday. Say yes to order." He says "yes." Total time is 6 minutes, versus days of requisition emails.

**Caveat:** I read most sources only as search summaries. Verify the GAO figures on gao.gov before putting them on a slide.