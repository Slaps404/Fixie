# Hero part: Whirlpool dryer thermal fuse WP3392519

Researched Sat Oct 24 2026. Many retailer sites return HTTP 403 to automated fetches, so each row says how its price was checked. **Say only "fetched today" numbers on stage.**

**Part:** Thermal fuse, opens at 196°F / 91°C. **WP3392519** = 3392519 = AP6008325 = PS11741460 (also replaces 3388651, 694511). It fits most Whirlpool / Kenmore / Maytag electric dryers, e.g. **Whirlpool WED4815EW**. Always confirm fit by the dryer model number.

## Prices

| Seller | Product | Price | Link | Checked how |
|---|---|---|---|---|
| AppliancePartsPros | **OEM** WP3392519, in stock | **$16.95** | [link](https://www.appliancepartspros.com/whirlpool-thermal-fuse-91-wp3392519-ap6008325.html) | ✅ fetched today |
| Jack's Small Engines | OEM WP3392519 | $17.71 | [link](https://jackssmallengines.com/jacks-parts-lookup/part/whirlpool/wp3392519) | ⚠️ search snippet |
| WhirlpoolParts.com (official) | OEM WP3392519 (item #2986) | $20.93 | [link](https://www.whirlpoolparts.com/PartDetail/Thermal-Fuse/WP3392519/2986) | ⚠️ search snippet |
| HD Supply | OEM WP3392519 | **$26.99** | [link](https://punchout.hdsupplysolutions.com/p/whirlpool-thermal-fuse-for-dryer-part-wp3392519-p665275) | ✅ fetched today |
| Sears PartsDirect | OEM WP3392519 | $35.56 (another snippet $32.73) | [link](https://www.searspartsdirect.com/product/504y9afdt5-0026-464/id-wp3392519) | ⚠️ search snippet |
| eBay (Express Parts Direct) | *Aftermarket* 3392519 | $6.85 | [link](https://www.ebay.com/itm/323794867223) | ⚠️ snippet, maybe old |
| Walmart (3rd-party) | *Aftermarket* 3-pack | $6.19 (~$2 each) | [link](https://www.walmart.com/ip/8081758749) | ⚠️ snippet |
| Home Depot | *Aftermarket* WEN Handyman | $4.55 | [link](https://homedepot.com/p/WEN-Handyman-Dryer-Thermal-Fuse-OEM-Part-Number-3392519-Q-D0031/308681502) | ⚠️ snippet |

RepairClinic, PartSelect, and eReplacementParts were blocked with no price found. Encompass and Marcone had no public price. In San Diego, the only lead is Aztec Appliance (4070 Kearny Mesa Rd); its parts counter is unconfirmed.

**Summary:**
- **Genuine OEM, same part number:** $16.95 → $35.56, about **2.1x**. Median $20.93.
- Including aftermarket: $4.55 → $35.56 (7.8x). Fixie compares **identical part numbers**, so aftermarket fuses are flagged `identicalPart: false` and excluded.

## Tech visit cost ("dryer not heating")

| What | Range | Sources |
|---|---|---|
| **San Diego diagnostic / service-call fee** (usually waived if you book the repair) | **$65–$150** | [ALFA $65](https://alfarepairpro.com/services/dryer/) ✅ · [ETS $99.95](https://etsappliancerepair.com/) ✅ · [WNDW $85](https://wndwappliancerepair.com/) ⚠️ · [FIXITPROF $89](https://fixitprof.com/) ⚠️ · [Sears Home Services SD $90–150](https://www.searshomeservices.com/locations/ca/san-diego) ⚠️ |
| **Total dryer repair**, national | $100–$200, **avg $150** | [Fixr](https://www.fixr.com/costs/dryer-repair) ✅ |
| Thermal fuse repair, national | $80–$130 / $85–$165 (~$125) | [HomeAdvisor](https://www.homeadvisor.com/cost/kitchens/dryer-repair/) ⚠️ · [EasyBear](https://easybear-appliancerepair.com/blog/dryer-thermal-fuse-replacement-cost) ⚠️ |

All San Diego numbers are the shops' own advertised rates.

## Honest savings math (use this on the board and on stage)

| | Tech visit | Fixie |
|---|---|---|
| Cost | **~$150** (Fixr average; SD range $100–$200) | **$17** genuine part + 15-min guided DIY |
| **Saved** | | **≈ $133** |

**Stage line:** *"Same Whirlpool part number: $17 at one counter, $35 at another. A tech visit for this runs about $150 in San Diego. Dorothy paid $17, and Fixie talked her through the 15-minute swap."*

⚠️ **HANDOFF said "$9 vs $200".** No genuine OEM fuse was found anywhere near $9; only aftermarket parts get that low. And $200 is the top of the San Diego range, not typical. I've set the role-play scripts and the mock to **$35 vs $17, tech visit $150, saved $133**. If Lane A prefers the round $9/$200, change both the scripts and `web/mock-events.json` together, and don't call a $9 part "genuine" on stage.

## DIY install (electric dryer, e.g. WED4815EW): the voice walkthrough steps
**Tools:** 1/4" nut driver, multimeter (optional), needle-nose pliers, vent brush. **Time:** about 10 min for the swap, 15–30 min overall. AppliancePartsPros rates it "Easy" ([source](https://www.appliancepartspros.com/whirlpool-thermal-fuse-91-wp3392519-ap6008325.html)).

1. **Unplug the dryer** from the wall. Say "unplugged" when done. *(Safety checkpoint)*
2. Pull the dryer out and disconnect the vent hose from the back.
3. Remove the screws around the rear access panel with a 1/4" nut driver, then lift the panel off.
4. Find the fuse: a small white oblong part with two wires, on the blower housing near the bottom.
5. Pull the two wires off (pliers help) and remove its one mounting screw.
6. Put the new fuse in the same spot. Either wire goes on either terminal. Replace the screw.
7. Panel back on, vent reconnected, **clean the vent run**, plug in, run on high heat. "Is it warm now?"

*(Optional step between 4 and 5: a multimeter continuity test. A good fuse beeps or reads ~0 Ω. Skip it for the stage demo.)*

**Safety policy:**
- **Gas dryers** use the same fuse, but Fixie **escalates gas dryers to a pro**.
- **Electric is DIY-safe only once unplugged**, so the agent requires a spoken "unplugged" before step 2.

## Root cause and stat
- A blown thermal fuse almost always means a **clogged vent**. Fixie tells Dorothy to clean it, or the new fuse blows again.
- **About 2,900 residential dryer fires a year in the US; failure to clean is the leading cause (34%)**, per [USFA](https://www.usfa.fema.gov/downloads/pdf/statistics/v13i7.pdf) (2008–2010 data). The newer [USFA page](https://www.usfa.fema.gov/prevention/home-fires/prevent-fires/appliance-and-electrical/) says 31% (2018–2020). Say "about 2,900 a year, per the U.S. Fire Administration."

## Demo numbers (spec v0.2) vs real prices
Tonight's role-play quotes are **staged numbers**, chosen to trip guards:
- PartsDirect **$9.10 + $3.95 = $13.05**.
- Valley **$55 + $4 = $59**, over the $40 cap on purpose.
- `parts.json` uses **techVisitCost $200**.

**Honest stage lines:**
- ✅ "Friends are playing the counters tonight." (Say it in the hook.)
- ✅ "In real listings, the same part number runs **$16.95 to $35.56**."
- ✅ "A tech visit runs **$100–$200** in San Diego."
- ❌ Don't say the demo prices are real listings.
- ❌ Don't call $9.10 a typical genuine-OEM price: the cheapest verified genuine price is $16.95.
- ⚠️ $200 is the **top** of the San Diego range (Fixr average is $150). Say "up to $200," or ask Lane A to set `techVisitCost: 150`. That changes the counter to $136.95.
