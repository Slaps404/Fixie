## Ports, yards and fleet MRO: market notes for Fixline

**Caveat on the numbers:** Most downtime-cost figures come from software vendors, not independent studies. Cite them as "industry estimates."

### Cost of downtime
| Asset | Figure | Source quality |
|---|---|---|
| Ship-to-shore (STS) crane | $5k–15k/hr lost throughput ([Indonesia-port vendor](https://marineinspection.app/blog/port-equipment-maintenance-inspection-indonesia)) up to $50k+/hr with vessel delay and demurrage ([Ports-Rail brief](https://heavyvehicleinspection.com/fleet-management/uptime/ports-rail-uptime-executive-brief)) | Vendor, no method stated. Say "$5k–$50k/hr". |
| Large container ship waiting | $12–20k/day idle ([TBS News](https://www.tbsnews.net/node/935326)). A World Bank estimate cited in a Thai journal puts a large vessel at over $100k per delay day ([JLDSC](https://ph03.tci-thaijo.org/index.php/JLDSC/article/download/4188/3069/30536)). | News and academic, mixed |
| Class 8 truck down | About $637/day lost revenue, so about $2k for a 3-day outage ([Penske](https://www.pensketruckleasing.com/resources/resource-library/cost-of-downtime/)). Fully loaded $1,600–2,600/day ([calculator](https://heavyvehicleinspection.com/blog/post/fleet-downtime-cost-calculator)). | Penske is solid. The calculator is vendor material. |
| Reefer | Temperature variation, poor monitoring and mechanical failure together account for about 30% of container claims ([Swedish Club via Identec](https://www.identecsolutions.com/news/when-a-reefer-unit-warms-up-understanding-failures-preventing-losses)). One case of 12 thawed tuna containers cost $500k. | Insurer data, strongest in this table |
| STS, straddle carrier, RTG, yard tractor | I found no sourced per-hour figure for straddle carriers, RTGs or yard tractors. | Gap. Don't invent one. |

ATRI's 2025 data has trucking cost at a record $2.336/mile, and repair and maintenance at 21.5¢/mile, up 8.6% ([FreightWaves](https://www.freightwaves.com/news/trucking-costs-outpaced-consumer-inflation-in-25-atri), [The Trucker](https://www.thetrucker.com/trucking-news/trucking-industry/trucking-is-getting-more-expensive-atri-report-explains-why)). TTNews printed 40.4¢ for repair and maintenance, but that appears to be a mislabeled lease-payment figure.

### How technicians diagnose and source parts today
- **Trucks:** Shops work a chain of calls: preferred vendor, then backup vendors, then cross-referencing alternates. Fullbay says its marketplace cuts this from up to 10 steps to 3 ([Work Truck](https://www.worktruckonline.com/news/fullbay-streamlines-heavy-duty-parts-procurement)). A Fullbay/TMC/MOTOR survey (2021–22) found 84% of shops reported worsening parts-delivery delays ([TLI](https://tlimagazine.com/news/fullbay)). That is dated but usable.
- **Cranes and lift trucks:** The OEM handles it. Konecranes TRUCONNECT feeds remote monitoring and STORE parts ordering, and is standard on its new port cranes and lift trucks ([Konecranes](https://investors.konecranes.com/press/asset-management-made-easy-digital-services-now-available-standard-all-konecranes-port-cranes)). That is a closed, single-OEM loop. Mixed fleets, older equipment and third-party gear are not covered.
- **Workforce:** LB/LA terminals are shifting toward automation technicians. A recruiter claims 90–120 day vacancies for lead techs ([KiTalent](https://kitalent.com/articles/long-beach-maritime-talent-crisis)). Treat that as unverified and promotional.

### San Diego, LA and Long Beach specifics
- **Port of San Diego:** It bought 2 battery-electric Konecranes Gottwald mobile harbor cranes (about $14M) for the Tenth Avenue Marine Terminal ([Breakbulk](https://breakbulk.com/articles/port-of-san-diego-buys-zero-emission-cranes)). It holds a $58.6M EPA grant, plus a $27.7M match, for 77 zero-emission units, and targets 100% zero-emission cargo handling equipment by 2030. First-generation EV equipment means thin tribal knowledge and unfamiliar parts. That helps the pitch, and it is a local hook for judges.
- **Long Beach:** A record 9.9M TEU in 2025. In June 2026 it approved $58.2M for 61 zero-emission cargo-handling units ([Container News](https://container-news.com/port-of-long-beach-approves-us58-million-for-zero-emission-equipment/)). The zero-emission rollout widens the diagnosis and parts-sourcing gap.
- I found nothing public on LA/LB maintenance parts-delay data.

### Competitors
- **Samsara** is the main threat. It has an AI agent that reads fault codes against service manuals, estimates cost and warranty coverage, and drafts work orders ([Trucknews](https://www.trucknews.com/business-management/samsara-puts-ai-at-the-core-of-fleet-tech-evolution-with-newest-product-lineup/1003198888), [CCJ Agent Studio](https://www.ccjdigital.com/technology/artificial-intelligence/article/15828568/samsara-unveils-new-agentic-ai-capability-agent-studio)). Its own knowledge base calls the AI severity output "experimental."
- **Fullbay and Decisiv** are shop-side workflow and marketplace tools. Neither is voice-first, and neither calls suppliers autonomously (not verified in 2026).
- **Fleetio and Uptake:** I found no 2026 data on them.
- **Wedge:** They stop at screens, dashboards and work orders. Nobody phones the supplier's counter and talks to a human. Phone-based sourcing is the differentiator versus Ray-Ban glasses and Gemini Live, because those can't call a parts desk and negotiate.

### Live data hooks (Dispatch track)
- **Fault codes:** Samsara exposes `DeviceHasVehicleFault` webhooks, including J1939 codes, and a `types=faultCodes` polling endpoint ([docs](https://developers.samsara.com/docs/fault-monitoring)). This needs a Telematics Essential license ([license page](https://developers.samsara.com/docs/tiered-plans-for-api-and-webhook-access)). In the demo you can simulate the webhook.
- **AIS:** aisstream.io has a free WebSocket feed, `wss://stream.aisstream.io/v0/stream`, with a free API key, bounding-box filters, and one connection per key ([example](https://medium.com/@vireshdoshi/harness-streaming-shipping-data-to-provide-insights-1d9fadffb52e)). Use a San Diego box.
- I found no existing product that joins AIS ETA with equipment DTCs. That is your claim of novelty, but I couldn't prove a negative.

### Three pitch-ready stats
1. "One hour of STS crane downtime costs a terminal an estimated $5k–$50k+" (vendor estimates).
2. "84% of heavy-duty shops report worsening parts delays" (Fullbay/TMC/MOTOR survey, 2021–22).
3. "Reefer failure and poor monitoring cause about 30% of container claims" (Swedish Club). Alternate: "A 3-day truck outage costs about $2,000 in revenue" (Penske/ATRI).

### Use-case narrative
**Tuesday 04:10.** AIS shows the *MV Example* (1,800 TEU) at 6 hours out from the Tenth Avenue Marine Terminal, with berth booked for 10:00. Meanwhile the telematics feed fires a J1939 fault on a battery-electric terminal tractor: a high-voltage contactor fault with derate. Fixline correlates the two events, because the unit is in tonight's discharge plan. It phones the on-shift technician and says: "Unit 14 has a contactor fault, and the ship docks at 10. Is it safe to inspect?" The tech confirms the model number by voice. Fixline fails safe on high-voltage work and routes it to a certified tech. Meanwhile it calls three OEM and distributor counters at once and learns that the nearest in-stock part is a 90-minute drive from San Diego. At 04:40 it calls the yard manager for a spoken "yes" to a $1,380 order with courier delivery. The part arrives at 07:00 and the tractor is back by 09:00. Without Fixline, the part would have been sourced at 08:00 after the berth window, and the delay would have cost about $5–50k/hr in crane and vessel idle time.

**Recommendation:** Pitch this as Dispatch plus Unsupervised: an event-triggered agent that spends money, with a safety gate and a spoken approval step. Keep the consumer AC demo as the "same engine" proof point.