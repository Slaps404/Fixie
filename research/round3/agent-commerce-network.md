**Verdict: the network layer is real as protocol plumbing, but no parts supplier speaks it yet. The smallest honest demo is a scoped spend mandate built on a Stripe Shared Payment Token (SPT).**

## What's real in Oct 2026

| Layer | Status | Usable in 1.5h? |
|---|---|---|
| **Stripe SPTs / ACP** | Documented API. An SPT carries `usage_limits` (max_amount, expires_at, currency), is bound to one seller's Stripe profile, and can be revoked. A sandbox test seller profile is published. It is US/CA/EU, under an "agent services preview" ToS. [docs](https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=agent) | **Yes**, assuming sandbox access works. Unverified: whether the preview needs approval. |
| **Stripe Issuing for agents** | Single-use virtual cards with spend and merchant-category controls. Card-backed agentic checkout is **private preview**. [docs](https://docs.stripe.com/issuing/agents.md) | No. Gated. |
| **Google AP2** | Open repo with Python/Go/Android samples. Intent, Cart, and Payment mandates are signed credentials. "Open vs. closed mandate" and key binding are described in the indexed docs. Secondary sources say v0.2 and a FIDO Alliance handoff in April 2026 (one source, unverified). Adoption is pilots only. [index](https://docsearch.algolia.com/mcp/docs/repo/google-agentic-commerce/ap2), [status](https://eco.com/support/en/articles/15192002-ap2-protocol-explained-google-s-agentic-commerce-standard-2026) | Borrow the vocabulary and mandate shape. Don't run the full stack. |
| **A2A** | Linux Foundation project with 150+ orgs. v1.0 is stable with signed Agent Cards. Discovery is `/.well-known/agent-card.json`. Microsoft and AWS support it. [LF](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year?hsLang=en) A "v1.2 production at Cloud Next" claim has one source only, so treat it as unverified. | Yes, a minimal agent card plus one JSON-RPC endpoint is cheap. |
| **Mastercard Agent Pay / Visa Intelligent Commerce** | Agentic tokens are real. Mastercard has live transactions in APAC, including India. Visa has 30+ sandbox partners, "some" live. No US consumer path for a hackathon. [Mastercard](https://developer.mastercard.com/merchant-cloud/documentation/tutorials-and-guides/ai-revolution/14/), [compare](https://atxp.ai/blog/mastercard-agent-pay-stripe-acp-visa-x402-comparison-2026) Stripe says it may use these tokens under the hood for SPT cards. | Cite only. Don't claim integration. |
| **x402** | Moved to a foundation. Google, Stripe, Visa, and Mastercard are reportedly members. Stripe added USDC machine payments in Feb 2026. More than 90% of volume is on Base, and part of the volume is spam. [Block](https://www.theblock.co/post/389352/stripe-adds-x402-integration-usdc-agent-payments), [Defiant](https://thedefiant.io/brian-armstrong-says-coinbase-processes-usd1t-in-stablecoin-payments-annually) | Wrong fit. Parts counters and Dorothy don't hold USDC. Skip it. |
| **Retailer MCP** | Shopify Storefront/Checkout MCP and the Google/Shopify UCP (Mar 2026) are real. [ecommercefastlane](https://ecommercefastlane.com/shopify-mcp-model-context-protocol/) **I found no appliance-parts retailer (PartSelect, Repair Clinic, Home Depot) with an agent MCP or checkout.** | Only if a parts seller is on Shopify. Unverified. |
| **Supplier-side AI receptionists** | I found **no evidence** of parts counters running Retell or Vapi receptionists, only generic Fiverr and agency listings. Unverified, and don't assert it either way. | N/A |

## Idea triage

- **Spend mandate bound to a voice "yes": build this.** The user's "yes" mints an SPT with `max_amount` set to the quote plus shipping, bound to one seller profile and a 24h expiry. It matches the AP2 intent-mandate concept in real Stripe primitives. Over-cap or wrong-seller charges are rejected by Stripe, not by our code. The kill switch calls `/revoke`.
- **Supplier agent endpoint (A2A card plus a `/quote` JSON-RPC, falling back to voice): build a mock.** Fixie tries the machine path first and the phone call second, which is a protocol-negotiation story. It is only honest if labelled a reference endpoint we host for a fake supplier, since no real counter exposes one.
- **Reverse auction: you already have it.** Your parallel calls and ranking are a de facto auction. Add a second round ("Supplier B quoted $8.40, can you beat it?") and log the delta. It costs about 20 minutes and no new protocol.
- **Caregiver co-signer over a threshold: cheap and sympathetic.** Above $X, Fixie texts the daughter, and the SPT is only minted after her reply. This is a policy gate and doesn't need a new protocol.
- **Escrow / pay-on-verified-fix: pitch only.** It needs real SPT capture control, a hold, and a dispute path. Stripe's docs note that tokens do not prove the agent picked the right product, and that disputes and refunds stay with the merchant. A mock "capture only after the 'it's hot' check" is tempting but would look fake. Don't build it.

## Judge fit

- **Meadow:** I couldn't verify what Meadow does. heymeadow.ai only showed the tagline "harvest attention," and a search returned a different company. Don't tailor claims to them. Ask them at the booth.
- **Corgi:** A YC full-stack carrier writing D&O, E&O, cyber, and AI liability. It raised a $160M Series B in May 2026 and is expanding into trucking ([TNW](https://thenextweb.com/news/corgi-160m-series-b-tcv-13bn-valuation-trucking)). I found nothing on appliance or home warranty lines. Two hooks follow from that.
  - **The agent-liability question.** A cryptographic record of what the user authorized, what the cap was, and what was actually charged is the evidence an insurer would want about an agent's actions.
  - **The trucking expansion.** It maps to your port-tractor J1939 beat.
  - Frame it as "audit trail an underwriter could price." Don't say Corgi would insure it.

## Smallest honest demo (~90 min)

1. When Dorothy says "yes" (about 25 min), mint a sandbox SPT: `max_amount` = quote plus shipping, `expires_at` = +24h, `seller_details.network_business_profile` = the Stripe test profile. Write a mandate JSON file (who, what, cap, seller, expiry, call transcript hash, SPT id) and show it on screen.
2. Add a mock supplier endpoint (about 25 min). Serve `/.well-known/agent-card.json` and a `/quote` route. Fixie tries it first and prints the machine quote next to the phone quotes. Label it "reference supplier, simulated."
3. Run the guardrail proof (about 25 min). Attempt a PaymentIntent at 2x the cap and show the Stripe rejection. Hit the kill switch and show the revoke succeed and a later charge fail. This is the strongest beat for the Unsupervised track and for Corgi, because the money limit is enforced outside our process.
4. Add the caregiver co-signer as an SMS gate above $50 (about 15 min), only if time remains.

**Claims to avoid:**
- Don't say "integrated Visa/Mastercard."
- Don't say "suppliers support A2A."
- Don't say "escrow."
- Don't say OpenClaw can't do this. Say instead that a general agent has no per-purchase, revocable, externally enforced mandate or supplier-negotiation protocol.
- Google AI Mode does call local businesses, so keep the differentiation on enforcement and audit, not on calling.