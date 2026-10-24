**Bottom line:** Consumers won't pay for this. The buyer is whoever pays for the repair and has a phone-first, screenless person on the other end: a warranty or insurance claims owner, a property manager, or a multi-site facilities operator. Most downtime and cost figures below come from vendor blogs (Oxmaint, Vixxo). Treat them as directional.

## Ranking (urgency × willingness to pay × phone-first fit)

| Rank | Buyer | Urgency | Willingness to pay | Phone fit |
|---|---|---|---|---|
| 1 | Multi-site restaurants / facilities | Very high | High | Very high |
| 2 | Multifamily property managers | High | Medium-high | High |
| 3 | Home warranty and insurers | Medium | Very high (large budgets) | High |

**1. Multi-site restaurants and facilities (QSR, convenience, retail).**
- Vixxo estimates $500–2,000/hr lost when a cooking line is down at lunch. It cites one 800-location QSR operator at $18M/yr in food-equipment downtime once labor and lost sales are counted ([Vixxo](https://www.vixxo.com/facilities-management-news/food-equipment-downtime-costs-what-qsr-facilities-directors-should-track)).
- A 2023 study cited by Vixxo puts QSR downtime at $5,800/hr. I could not verify that study.
- The caller is a shift manager with greasy hands, who is screenless by nature. This is the best fit for the No App track.
- Per-incident pricing is easy to justify: a $1,250 breakdown ([OxMaint](https://oxmaint.com/article/restaurant-bar-kitchen-equipment-maintenance-program)) against a $30–75 per-resolved-case fee.
- Facilities-management outsourcers like Vixxo are the real buyers.

**2. Multifamily property managers.**
- Annual maintenance runs about $1,150/unit in one Oxmaint benchmark and $3,600/unit in another, so the sources disagree by 3x ([benchmarks](https://oxmaint.com/industries/property-management/property-maintenance-cost-benchmarks-per-unit-2026)).
- NAA data cited by Oxmaint shows operating expenses of $8,657/unit in 2024, with repair costs up 28% since 2021 ([Oxmaint](https://oxmaint.com/industries/property-management/preventive-maintenance-apartment-complexes-guide-2026)).
- Emergency HVAC replacement carries a 150–200% premium over planned work (vendor claim, [Oxmaint](https://oxmaint.com/industries/hvac/hvac-capex-forecasting-for-facility-portfolios-for-commercial-hvac-assets)).
- Operators are already adopting AI assistants for routine requests ([Multifamily Executive](https://www.multifamilyexecutive.com/index%2ephp/apartment-trends/inside-2026-operations-playbook)).
- Tenants call, and the 24/7 on-call tech is the screenless user.
- A SaaS price of about $1–3/unit/month is my own estimate, not sourced. On 10,000 units that is $120–360K/yr.
- Our edge is repair-or-replace plus cheapest-correct-part sourcing, which is more than call intake.

**3. Home warranty and insurers.**
- Frontdoor (American Home Shield) had $2.093B revenue in FY2025 and about 55% gross margin. It handles about 3.8M service requests a year across 2.1M members and about 17,000 contractors ([10-K](https://www.sec.gov/Archives/edgar/data/1727263/000119312526076548/ftdr-20251231.htm), [release](https://www.businesswire.com/news/home/20260226042868/en/Frontdoor-Announces-Record-Full-Year-2025-Financial-Results)). Cost of services was $936M.
- By my arithmetic, 1% savings on that is about $9M/yr. I found no public parts-cost-per-claim data.
- The caveat is that contractors buy the parts, not the warranty company. Our pitch to them is to diagnose first, stop wasted truck rolls, and decide repair versus replace.
- Corgi underwrites startup commercial lines, not home repair ([YC](https://www.ycombinator.com/companies/corgi)). Say "claims-cost reduction for any carrier," not "Corgi's market."
- Sales cycles are long. This is the best story for judges, but the weakest to close.

## Not top 3
- **Farms:** Iowa State estimates about $900 (harvest) to $2,400 (planting) per 8-hr downtime day for 12-row equipment. Sources conflict, and I only have this through secondary pages ([Whiparound](https://whiparound.com/?p=19034)).
  - Timely hook: Deere settled with the FTC on July 8, 2026. It must give independent shops dealer-grade diagnostic tools for 10 years ([Local10](https://www.local10.com/business/2026/07/08/john-deere-owners-will-get-the-right-to-repair-their-own-equipment-under-a-new-ftc-settlement/)). A $99M class action settled in April.
  - Farms are fragmented and low-budget, so use this as a demo narrative, not the business.
- **Hospital biomed:** OxMaint says imaging downtime costs $1,500–3,000/hr and emergency parts cost 60–80% more. Parts are mostly OEM-locked and regulated, so a cheapest-identical-part pitch fits poorly.
- **Utilities, telecom, defense:** I found no usable data on these. Procurement is internal and slow. Don't claim numbers for them. Mention them only as a roadmap.
- **Industrial MRO:** The market is about $711B in 2026 ([Precedence](https://www.precedenceresearch.com/mro-distribution-market)), and US MRO about $95B (Mordor via [GII](https://www.gii.tw/report/moi2124518-united-states-maintenance-repair-operations-mro.html)).
  - The $260K/hr downtime figure is a cross-industry average that is widely repeated but weakly sourced.
  - It is the biggest market but the worst wedge, because ERP-heavy buyers sit behind well-funded incumbents.

## Competitors and how we differ
- **Pactum:** $54M Series C in June 2025, with customers including Walmart and Linde ([Pactum](https://pactum.com/news-pactum-secures-54-million-in-series-c-funding-to-scale-agentic-ai-in-procurement/)).
- **Didero:** $30M Series A in Feb 2026, for manufacturers and distributors ([Sacra](https://sacra.com/c/didero)).
- **Lio:** $30M Series A led by a16z in March 2026 ([TechCrunch](https://techcrunch.com/2026/03/05/lio-ai-series-a-a16z-30m-raise-automate-enterprise-procurement/)).
- **Fairmarkit and Zip:** autonomous tail-spend sourcing plus negotiation agents ([Fairmarkit](https://fairmarkit.com/blog/fairmarkit-partners-with-zip-to-power-source-to-pay-with-autonomous-sourcing), [Zip](https://www.businesswire.com/news/home/20251021882875/en/Zip-Launches-Powerful-Suite-of-AI-Agents-to-Help-Companies-Identify-Overpayments-and-Negotiate-Better-Deals-Driving-Cost-Cutting-Across-All-Categories-of-Spend)).

All of these start from a purchase request typed into a procurement system by a buyer at a desk. We start from a broken machine and a non-buyer on a phone. The agent does the diagnosis, the safety gate, identification of the exact part, and the supplier calls. The output is a repair outcome, not a purchase order. That is the gap to claim, and it also answers the "just ask ChatGPT or Ray-Bans" objection: a chatbot gives advice, and ours places calls and closes the loop.

## Risks to pre-empt with judges
- **Prior art:** A solo hackathon build already phones suppliers for spare parts using ElevenLabs agents ([LinkedIn](https://fi.linkedin.com/in/oskari-valtonen)). Workd already sells voice and photo parts lookup to HVAC distributors ([Workd](https://www.workd.com/industries/hvac/)). Differentiate on the full loop plus the safety gate.
- **Supplier acceptance:** No source says whether supply houses will give quotes to AI callers. Call two local supply houses today and use the result in the demo.
- **Pitch:** Lead with "free to the caller, paid per resolved incident by the party that bears the repair cost." Show the 1% of $936M and $18M/800-store numbers as illustrations, labeled as estimates.