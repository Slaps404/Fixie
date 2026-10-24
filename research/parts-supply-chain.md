## Parts supply chain: what an agent can actually find, price and pull (Oct 2026)

**Reliability note.** My search tool returned stale or snippet-level prices, and PartSelect, RepairClinic, Jack's and Sears all returned HTTP 403 to direct fetch. Treat every price below as a snapshot, not a live quote. The 403s are themselves a finding: **don't plan on scraping major retailers in a 4.5-hour build.**

### 1. Identifying the part
- **Model and serial:** The nameplate is on the unit.
  - Fridge: inside the fresh-food wall or ceiling.
  - Dryer: door frame or inside the door.
  - Outdoor AC: side panel of the condenser.
  - Mower: deck or engine shroud. The engine has its own model and type code, such as Honda GCV160 or a Briggs model/type/code.
- **Capture by photo:** The elder texts or FaceTimes a photo of the nameplate. A vision model reads the model and serial. This is the one multimodal step where you shouldn't ask the user to type.
- **Part numbers:** The model number leads to an exploded diagram and then a part number. Retailers list "replaces/supersedes" chains. Examples:
  - Dryer fuse 3392519 = WP3392519 = AP6008325 (also 3388651, 694511).
  - Honda carb 16100-Z0L-853 supersedes -851 and -852.
- **Spec-based parts:** Capacitors are matched by spec (µF, voltage, round vs oval), not by OEM number. This makes them ideal for cross-shopping. Spark plugs are also spec-matched, but check the engine manual. Sources conflict on BPR5ES vs BPR6ES for GCV160 ([forum thread](https://lawnmowerforum.com/goto/post?id=155735)).

### 2. Supply-chain tiers and markups
- **Chain:** OEM or factory → distributor → retailer or dealer → consumer. Johnstone Supply, Ferguson, and Baker are the HVAC distributors.
- **Distributor access:** Wholesale tiers are generally gated behind contractor accounts and tax IDs.
- **Markup figures are weak.** I found only unverified claims:
  - Walk-in customers paying 30-60% more than account holders.
  - Contractor pricing at about 65-70% of retail (a 1999 post).
  - One homeowner anecdote of a $15 counter capacitor vs a contractor's $75 minimum part charge plus 1 hour at $150 ([forum](https://bobistheoilguy.com/forums/threads/home-depot-hvac-parts.407727/post-7617655)).
- **Where the savings are:** The biggest spread is not retailer vs retailer. It is **branded or OEM vs equivalent aftermarket**, and **part vs service-call "part fee" plus labor**. A DIY-guided fix on a $10 part avoids the $150-$300 visit.
- **Phone ordering:** I found no evidence that phone ordering gets better prices. Sears PartsDirect showed a *higher* phone price than web. Price-match policies at PartSelect, RepairClinic and AppliancePartsPros were not verifiable from my searches, so I can't confirm they exist.

### 3. Worked examples (snapshot prices)

**A. AC dual run capacitor, 45/5 µF 440V round (the most common AC failure)**
- Packard Titan Pro TRCFD455: $18.69 on Walmart, was $31.99 ([search result](https://www.walmart.com/c/kp/run-capacitors)). Home Depot lists it at [$10.99](https://www.homedepot.com/p/Packard-TITAN-PRO-45-Plus-5-MFD-440-370V-Dual-Voltage-Round-Run-Capacitor-TRCFD455/334530823), but that page is stale.
- Supco CD45+5X440R: $15.78 at [HNK Parts](https://www.hnkparts.com/supco-cd45-5-440r-dual-run-capacitor-45-5-mfd-440v-round) vs $50.69 at [HD Supply](https://punchout.hdsupplysolutions.com/p/supco-440-volt-45-5-mfd-round-dual-run-capacitor-p252498). Amazon showed it unavailable.
- Mars on [eBay](https://www.ebay.com/p/809983310): $15.99. Dayton 2MEJ9 on [PartsSource](https://www.partssource.com/parts/dayton-electric-manufacturing-co/2MEJ9): $27.05. Titan HD oval POCFD455A: $46.80.
- **Spread: about $11 to $51, roughly 4-5x for the identical spec.** The risks are voltage/µF/shape mismatches and capacitor safety. The agent must tell the user to cut power at the breaker and discharge the capacitor, or send them to a pro.

**B. Honda GCV160 carburetor, 16100-Z0L-853**
- Genuine at [DHS Equipment Parts](https://stores.dhsequipmentparts.com/honda-part-number-16100-Z0L-N21): $21.93.
- Troy-Bilt Canada: [$40](https://www.troybilt.ca/en/all-parts/honda-part-number-16100-z0l-853.-carburetor/16100-Z0L-853.html). Used on [eBay](https://www.ebay.com/p/7031754232): $53.99.
- Aftermarket on Amazon: about $14-18 ([example](https://www.amazon.com/SIMPERAC-GCV160A-GCV160LA-GCV160LA0-Carburetor-Auto/dp/B0BWXSHLHC)). eBay: $9.98-$12.83.
- **Spread: about $10 to $54.** Aftermarket quality and choke type (manual vs auto) vary. Cleaning the carb is often the real fix, so diagnosis first can save the whole purchase.

**C. Whirlpool dryer thermal fuse, WP3392519**
- RepairClinic: [$9.64 on one page, $21.19 on another](https://www.repairclinic.com/PartDetail/Thermal-Fuse/WP3392519/2986).
- [AppliancePartsPros](https://www.appliancepartspros.com/whirlpool-thermal-fuse-91-wp3392519-ap6008325.html): $16.95. [PartSelect](https://www.partselect.com/PS11741460-Whirlpool-WP3392519-Dryer-Thermal-Fuse.htm): $17.15, but it carries a note that the part is no longer available. [eReplacementParts](https://www.ereplacementparts.com/parts/dryer/whirlpool/erp11741460/dryer-thermal-fuse-wp3392519/): $17.55.
- [Sears PartsDirect](https://www.searspartsdirect.com/product/504y9afdt5-0026-110/id-wp3392519): about $52-55.
- Aftermarket fuses on Walmart: $5-14 ([example](https://www.walmart.com/ip/8081758749)).
- **Spread: about $5 to $55.** The fuse usually blows because of a clogged dryer vent. The agent should ask about the vent, or the new fuse will blow again.

**Bonus, fridge:** Door shelf bin WPW10321304 is about $47.40 at PartSelect and RepairClinic and $47.41 at AppliancePartsPros ([listing](https://www.appliancepartspros.com/whirlpool-bin-door-collar-wpw10321304-ap6019471.html)). Water inlet valve W10408179 is about $78.77 at RepairClinic. OEM-vs-OEM retailers are nearly identical on price. The savings come from aftermarket and used parts.

### 4. Live vs mock for the demo
**Live, realistic in hours:**
- **Vision:** Nameplate photo to model number with Claude. The strongest live demo.
- **Search APIs:** [Channel3](https://docs.trychannel3.com/pricing) is a product search API with live prices, merchant URLs, and an MCP server whose free tier needs no key ([mcp.so](https://mcp.so/servers/mcp-server-channel3-ai)). It has 1,000 free searches per month, then $0.007 each. Its parts coverage is unverified, so test it with part numbers first. A SERP/Google Shopping API or Walmart search is a fallback for a part number query. Verify terms and keys before relying on either.
- **Voice:** Outbound and inbound calls with Retell, LiveKit or Vapi. IVR navigation is documented for [Retell](https://docs.retellai.com/build/telephony/navigate-ivr) and [LiveKit](https://docs.livekit.io/reference/recipes/ivr-navigator). Vapi's IVR support is murkier.
- **One real call:** Place one live call to a friendly teammate playing the parts counter. A real store call won't be reliable at a demo.

**Mock or cached:**
- **eBay Browse API:** Production access needs approval and a contract ([docs](https://developer.ebay.com/api-docs/buy/browse/overview.html)). The sandbox returns mock data only.
- **Amazon:** PA-API is being replaced by the Creators API, which requires qualifying sales ([notice](https://programma-affiliazione.amazon.it/creatorsapi/docs/en-us/paapiv5-deprecation)). The deprecation date is disputed (Jan 31 or Apr 30, 2026). Don't depend on it.
- **PartSelect and RepairClinic:** No public API found, and direct fetches were blocked. **Pre-cache** the three worked examples above as JSON.
- **Distributor tiers:** Mock the Johnstone and OEM wholesale quote. Label it clearly as simulated.

**Recommended build:** Live photo to model and part number, with live Channel3 or SERP lookups for 1-2 parts. Hard-code cached price tables for the three examples as a fallback. Show the spread (for example, $50.69 vs $15.78 for the same capacitor) as the "you saved $X" line the agent speaks on the callback.