# Voice-agent ordering research: how Fixie places a real parts order after "order it"

Date: 2026-10-24 (hackathon demo tonight). Target part: Whirlpool thermal fuse WP3392519 (~$10-15 in the market, see note in section 6).
Scope: sandbox/test feasibility for one dev in ~2 hours, plus the production path. Extends `research/round3/agent-commerce-network.md`.

Confidence labels used throughout:
- **[V]** verified: I fetched a primary doc or inspected the vendor's published SDK package.
- **[S]** secondary: search-result summary, third-party article, or a page I could not open directly.
- **[U]** unverified: inference or could not confirm. Do not repeat as fact on stage.

---

## 0. Bottom line (read this first)

1. **No sandbox virtual card can buy a real part.** Stripe says its Issuing sandbox cards "can only be used for testing within your Stripe account and not for external purchases" [V]. Lithic sandbox says "no real money or card transactions occur" [S/V: Lithic docs via search + fetched pages]. A real order needs either a production issuer program (sales + KYB) or a real card.
2. **No appliance-parts retailer exposes an ordering API or runs on a checkout platform we can drive.** AppliancePartsPros is ASP.NET, not Shopify [V, observed headers/body]. PartSelect, RepairClinic, eReplacementParts and SearsPartsDirect returned Cloudflare HTTP 403 to a plain curl from this host [V observation, one IP]; their platform is unknown [U]. No source I found says any of them is on Shopify [S].
3. **The only self-serve, order-capable sandbox tonight is Rye staging** (checkout-intents REST API; Stripe test token) [V]. The only self-serve, card-capable sandbox tonight is **Lithic** (MERCHANT_LOCKED / SINGLE_USE + simulate authorization) [V]. They do not connect to each other (Rye wants a Stripe token made with Rye's publishable key, not an external PAN [V]). The glue is our orchestrator, and the demo must say "simulated".
4. **Your prior is mostly right, with two corrections.** (a) "Lithic + simulated authorization at the merchant" is verified feasible. (b) "Combine with Crossmint staging for the order" is refuted for the card-on-file/Agent Checkouts product: Agent Checkouts is production-only and "Purchases are real" [V]; production reportedly needs an Order Form and KYB [S]. Use **Rye staging** for the order instead.

---

## 1. Comparison table

| Option | (a) Sandbox self-serve today? | (b) Reaches parts merchants? | (c) Who holds PAN / PCI | (d) Time to first sandbox order (1 dev) | (e) Cost | Verdict for tonight |
|---|---|---|---|---|---|---|
| **Rye Universal Checkout** (`POST /api/v1/checkout-intents`) | Yes. Staging console register + Staging API key on Account tab [V] | "Any product on the internet" given a product URL; Amazon via Rye's own account; Shopify; Best Buy; AI-agent fallback for other sites; anti-bot stores (REI, Sephora) unsupported [V]. Parts retailers: no evidence either way [U] | Stripe-token path: Rye is merchant of record, you never see PAN [V]. Basis Theory path: card forwarded to merchant vault (Shopify's), Rye not MOR for Shopify [V]. External VCC PAN: not documented [U] | 30-45 min | $149/month, first month free (Universal Checkout); Sync API is GMV-based with a deposit [V, API comparison page] | **Use for the order beat** |
| **Violet.io** | Signup at channel.violet.io/signup; sandbox API exists [S] | Merchants connected to Violet's channel network; Shopify listed as bag platform; Amazon not found [S] | Not checked [U] | Unknown (docs page I tried 404'd) | Not published; "book a demo" [S] | Skip |
| **Shopify Storefront/Checkout MCP + UCP** | Docs public; agent must host a profile at a well-known URL; "higher trust tiers unlock ... direct checkout completion"; Universal Cart is waitlist [V] | Shopify merchants only. No parts retailer confirmed on Shopify [V/S] | Merchant storefront or Shopify handoff [V] | Not feasible tonight (trust tier gate) | Free to read docs | Skip; mention in pitch only |
| **Stripe SPT (agent side)** `POST /v1/shared_payment/issued_tokens` | ToS click-through ("agent services preview"); no allowlist statement found on the agent-side page [V]; whether `2026-09-30.preview` needs allowlisting for a fresh account: [U] | Only sellers that accept SPT on Stripe. Test seller profile `profile_test_61TU90nIeGjU7NNVXA6TU90m7ISQWsBxpcx9lASWWXTk` works in sandbox [V]. No parts retailer known | Stripe holds PM; seller never sees PAN [V] | 30-45 min for mint + revoke + over-cap demo | Standard Stripe processing | Optional "mandate" beat; does not place a retail order |
| **Stripe Issuing (cards)** | Sandbox: self-serve activation in Dashboard [S, Stripe docs via search]; live needs sales/application [V "apply"] | Any merchant in live; sandbox cards are Stripe-internal only [V] | Stripe; virtual card number/CVC retrievable via `expand[]=number&expand[]=cvc`, PCI guidance applies [V] | 45-75 min (cardholder, card, top-up, test authorization) | Virtual card $0.10 each US (live) [V] | Strong alternative to Lithic |
| **Stripe Issuing for agents / card to SPT** | **Private preview**: `card[issuing_card]` rejected as unknown parameter without access [V] | Same as SPT | Stripe | Blocked | n/a | Not tonight |
| **Lithic** (MERCHANT_LOCKED / SINGLE_USE) | Yes. Sign up at lithic.com/signup, Sandbox API key at app.lithic.com/settings, no approval mentioned [V] | Any merchant in production (Visa network); sandbox is simulated only [V] | Lithic issues; PAN/CVV visible to all clients in Sandbox, only PCI-verified clients in Production (else Embedded Card UI) [V] | 30-45 min | Sandbox free; production pricing unpublished, program via sales [S] | **Use for the mandate/limit beat** |
| **Privacy.com API** | Needs a paid plan (Plus $5/mo, Pro, Premium) and CIP identity verification; sandbox after access enabled [S + V for CIP] | Any merchant in production; consumer product | Privacy | 1+ hr, gating risk | $5-20/mo [S] | Skip tonight |
| **Highnote** | Contract-gated, "self-serve dashboard signup and a test environment" per a directory listing [S] | n/a | Highnote | Unknown | Custom [S] | Skip |
| **Crossmint Agent Checkouts** | **No staging**: production key only, "Purchases are real"; `ck_staging` keys return 401 [V]; production reportedly needs Order Form + KYB [S] | "any website" via `startUrl` [V] | Card stays in Crossmint vault; Visa Intelligent Commerce / Mastercard Agent Pay one-time numbers where supported [V] | Blocked tonight | Not published; sales [S] | Not tonight; production candidate |
| **Crossmint order-intents (staging)** | Staging self-serve; `POST https://staging.crossmint.com/api/unstable/order-intents` [V] | Amazon headless checkout in staging is USDC-funded per search summary [S] | Network tokens: real PAN never exposed; encrypted-card fallback does not enforce the allowance [V] | 1.5+ hr (needs user JWT, saved card) | Unknown | Skip |
| **Visa Intelligent Commerce / Mastercard Agent Pay** | No self-serve signup found; Visa "30+ partners in sandbox"; MC portal has "Onboard to Sandbox" tutorial [S] | Network-level; no parts retailer | Network tokens | Not tonight | n/a | Cite only |
| **Amazon Business Ordering API** | Partner onboarding **4-6 weeks**; no dedicated sandbox described; API Explorer + test mode only [V] | Amazon only | Customer's Amazon Business payment method | Impossible tonight | Free API; needs business account | Production consideration only |
| **Browser agent (Browserbase/Stagehand, Skyvern)** | Free tiers exist (Browserbase Free: 1 browser hour, no captcha solving, Verified: No) [V] | In principle any site, but Cloudflare-fronted parts sites blocked plain curl [V observation] | Raw PAN enters agent context: you own PCI scope | 2+ hr, high flake risk | $0-$99/mo Browserbase [V] | Last resort only |

---

## 2. Option 1: Universal checkout APIs

### 2.1 Rye (the strongest fit for the order step)

Facts below are from Rye's own docs. **Domain caveat:** `docs.rye.com` returns a 308 redirect to `docs.commerce.jolly.dev`, and the SDK's default base URL is also `api.commerce.staging.jolly.dev` [V, SDK `checkout-intents@0.32.0` inspected]. A search summary instead quoted `staging.api.rye.com`, which I could not confirm [S]. The page content self-identifies as the Rye API, but because a redirect host is server-supplied, the founder should reach the console by navigating from rye.com rather than trusting links in this file.

- **Sandbox:** Self-serve. Register at `https://console.commerce.staging.jolly.dev/register` (Google or password), copy the **Staging API Key** from the Account tab. Staging and production are separate accounts with separate keys [V].
- **Base URLs:** staging `https://api.commerce.staging.jolly.dev`, production `https://api.commerce.jolly.dev` [V].
- **Auth:** `Authorization: Basic $RYE_API_KEY`; key format `RYE/staging-...` [V].
- **Flow (two-step) [V]:**
  1. `POST /api/v1/checkout-intents` body: `{buyer:{firstName,lastName,email,phone,address1,address2?,city,province,postalCode,country:"US"}, productUrl, quantity}`. Intents cannot be edited. US shipping only.
  2. Poll `GET /api/v1/checkout-intents/{id}` until `state == "awaiting_confirmation"`. Read `offer.cost.subtotal|tax|total` (as `amountSubunits` + `currencyCode`) and `offer.shipping.availableOptions`.
  3. `POST /api/v1/checkout-intents/{id}/confirm` body: `{paymentMethod:{type:"stripe_token", stripeToken:"tok_visa"}}`. In staging this places no real order.
  4. Poll until `state` is `completed` or `failed` (`failureReason.code`, for example `product_out_of_stock`, `payment_failed`, `constraint_total_price_exceeded`).
- **Single-step:** `POST .../checkout-intents/purchase` with `buyer, quantity, productUrl, paymentMethod` and optional `constraints:{maxTotalPrice, maxShippingPrice, offerRetrievalEffort: "max"|"low"}` [V]. Note: the Basis Theory page writes the path as `/v1/checkout-intents/purchase` while the quickstart uses `/api/v1/...`; check against the OpenAPI spec (`https://docs.commerce.jolly.dev/openapi.documented.yml`) [U which is canonical].
- **Units of `maxTotalPrice`:** the type is `number`; the doc does not say cents vs dollars [U]. Test with a known product before relying on it.
- **Payment methods:** `stripe_token` (must be created with Rye's Stripe publishable key; your own key makes the intent fail; tokens are single-use), `basis_theory_token`, `drawdown` (prepaid balance with Rye), `x402` [V].
- **Staging test products:** a Shopify test store `rye-test-store.myshopify.com` (for example `/products/product-published-to-rye-channel`; also `/products/sold-out-product`, `/products/fails-during-checkout`, `/products/high-value-product`). **Do not use `rye-protocol.myshopify.com`**: it uses a live gateway, so test orders there are real transactions (uncaptured, funds returned after about a week) [V]. Docs say nothing about simulating Amazon in staging [V gap].
- **Amazon:** In Universal Checkout, orders go through Rye's own Amazon account and orders over $15 get Prime shipping; the Sync API uses your Amazon Business account and a deposit [V].
- **Merchants and limits:** US-only; stores with advanced anti-bot are unsupported; no post-purchase tracking or webhooks for agent-placed orders (tracking goes to the buyer's email) [V].
- **Costs:** Universal Checkout $149/month with first month free; Sync API GMV-based with volume discounts and a drawdown deposit [V]. No other fee schedule published [U].
- **SDK:** npm and PyPI package **`checkout-intents`** (repo `rye-com/checkout-intents-sdk`). Constructor takes `apiKey`, `environment` (`staging` default) or `baseURL`. Helpers: `client.checkoutIntents.create`, `createAndPoll` (create + wait for awaiting_confirmation), `confirm`, `confirmAndPoll` (confirm + wait for completed/failed), `purchase` [V, read from the published package type definitions].
- **Production gating:** The go-live page lists only a technical checklist (production account, production key, Rye's live Stripe publishable key); it does not mention approval, KYB or contract, and does not rule them out [V gap]. Treat "can a founder place one real $12 order tonight on Rye production with their own card" as plausible but **[U]**.
- **Does Rye reach any appliance-parts retailer?** Unknown [U]. The `offerRetrievalEffort: max` setting includes an "AI agent fallback" [V], so arbitrary sites are attempted, but Cloudflare-fronted parts sites may be blocked by the same bot detection Rye lists as a limitation.
- **Virtual card as payment:** the Basis Theory page shows tokenizing a card with `number, expiration_month, expiration_year, cvc` into Rye's BT container, which a VCC PAN could technically fill, but docs never mention virtual cards [V gap]. Token CVC expires after 60 minutes [V]. This is the likely production bridge from Lithic to Rye and **needs a conversation with Rye** [U].

### 2.2 Violet.io [S only]
Signup at `channel.violet.io/signup`, create an App, Postman collection, a sandbox API host exists; carts hold one "bag" per merchant synced to the merchant's platform (Shopify listed). No public pricing, no Amazon evidence. The Quickstart URL I fetched returned Page Not Found [V]. Not recommended.

### 2.3 Shopify (Storefront / Checkout MCP / UCP) [V from shopify.dev/agents]
- Products: Global Catalog, Storefront Catalog, Cart MCP, Checkout MCP, Order MCP. Universal Cart is a waitlist.
- Auth: the agent hosts a **profile** at a well-known URL and references it on every UCP request. Shopify uses it to verify the agent and set rate limits and tool access. "Higher trust tiers unlock broader access, including direct checkout completion"; otherwise the buyer is handed to the merchant storefront to pay.
- I could not confirm endpoint URLs, a test-store flow, or how trust tiers are granted [V gap]. Not feasible tonight.
- Useful hooks: `https://shopify.dev/docs/agents/get-started/quickstart`, `.../carts-and-checkout/checkout-mcp`.

### 2.4 Are appliance-parts retailers on Shopify?
- **AppliancePartsPros: No [V].** Homepage returns `ASP.NET_SessionId`, `__VIEWSTATE`, and 36 `.aspx` references; robots.txt has no Shopify paths; zero "shopify" strings in the 155 KB homepage.
- **PartSelect, RepairClinic, eReplacementParts, SearsPartsDirect: unknown [U].** Plain curl got `HTTP 403` from Cloudflare on all four from this host, so I could not fingerprint them. A web search found no mention of Shopify for any of them [S]. PartSelect states it is a division of Eldis Group and merged with EasyApplianceParts [S].
- To settle it fast in a browser: view-source and search for `cdn.shopify.com`, or run BuiltWith/Wappalyzer on each domain.

---

## 3. Option 2: Agent payment rails

### 3.1 Stripe SPT / Agentic Commerce Protocol
- **Seller-side test helper (create a token to test a seller integration):** `POST /v1/test_helpers/shared_payment/granted_tokens` with `payment_method` (required), `usage_limits[currency]`, `usage_limits[max_amount]` (required), `usage_limits[expires_at]` (optional), optional `customer`, `shared_metadata`. Response object `shared_payment.granted_token`, id prefix `spt_`. Revoke: `POST /v1/test_helpers/shared_payment/granted_tokens/:id/revoke` (test mode only). Introduced in changelog 2026-04-22 [V for create page; revoke path V via reference listing/search].
- **Agent-side (what Fixie would be):** `POST /v1/shared_payment/issued_tokens` with header `Stripe-Version: 2026-09-30.preview` and `payment_method`, `seller_details[network_business_profile]`, `usage_limits[currency|max_amount|expires_at]`, optional `return_url`. `GET /v1/shared_payment/issued_tokens/:id`. `POST /v1/shared_payment/issued_tokens/:id/revoke`. Status `active | requires_action | deactivated`. Webhooks `shared_payment.issued_token.{requires_action,active,used,deactivated}` [V].
- **Self-serve?** The page says create a Stripe account and a Stripe profile, and "by using SPTs you agree to the terms" (agent services preview). Nothing about an allowlist on the agent-side page [V], but the preview API version header could still require account enablement [U]. Available to agents/customers/sellers in US, CA, and listed EU countries [V].
- **What it can and cannot do:** An SPT is only redeemable by a **seller who is on Stripe and accepts SPT** (they create a PaymentIntent with it). No parts retailer is known to do this [S/U]. Rye does **not** accept an SPT (only `stripe_token`, `basis_theory_token`, `drawdown`, `x402`) [V]. So SPT is the "mandate" demo, not the order path.
- Card networks: Stripe "might use tokens issued through ... Mastercard's Agent Pay and Visa's Intelligent Commerce programs on your behalf" for card SPTs [V footnote].

### 3.2 Stripe Issuing for agents [V]
- Live access: "apply" in the Dashboard or contact Stripe. Cards for your own business vs. for your platform (consumers) are separate request paths.
- **Single-use:** `lifecycle_controls[cancel_after][payment_count]=1` on `POST /v1/issuing/cards`. Card flips to `canceled` after one approved authorization over $1 or a force post; a force post after cancellation must still be processed and may need a dispute [V].
- **Card-to-SPT bridge** (`card[issuing_card]` on `POST /v1/payment_methods`, header `Stripe-Version: 2026-04-22.preview`): **private preview, access required** [V].

### 3.3 Visa Intelligent Commerce, Mastercard Agent Pay [S]
Visa Trusted Agent Protocol is on the Visa Developer Center and GitHub; the VIC sandbox has 30+ partners; no self-serve signup found. Mastercard has a developer portal tutorial "Onboard to Sandbox" and requires agent registration ("Know Your Agent"); Agent Pay for Machines is a pilot. Cardholder enrolment is required. None is realistic for a single dev tonight. Cite only.

### 3.4 Crossmint
- **Agent Checkouts** (`https://www.crossmint.com/api/unstable/agent-checkouts`): `POST /` with `{request:{startUrl,task}, constraints:{maxCost:{amount,currency}}}`, headers `X-API-KEY` and `x-crossmint-user-id`; `GET /{runId}`; `POST /{runId}/messages`; `POST /{runId}/cancel`; statuses `awaiting_input, succeeded, blocked, failed, cancelled`. Requires a **production** server key with `agent-checkouts.*` scopes; "Purchases are real"; no staging [V]. Production access reportedly needs a signed Order Form and KYB [S, single secondary source].
- **Order intents** (spend allowance): `POST https://staging.crossmint.com/api/unstable/order-intents` with `paymentMethodId`, `amount{value,currency}`, optional `merchant{name,url,countryCode}` (fixed for the intent's life if set), `description`, `expiresAt`; client key with `order-intents.create|read` plus the card owner's user JWT [V]. On Visa/Mastercard rails the card network enforces the limit; on the encrypted-card fallback "the rail doesn't enforce the allowance, so you must keep purchases within the limits yourself" [V].
- Staging Amazon orders are documented with USDC from an agent wallet [S], which does not fit a US consumer paying by card.

---

## 4. Option 3: Amazon Business APIs [V]
Source: `https://docs.business.amazon.com/docs/ordering-api`.
- `placeOrder`: `POST /ordering/2022-10-30/orders`; `orderDetails`: `GET /ordering/2022-10-30/orders/{externalId}`. OAuth 2.0 via Login With Amazon; requests must be signed (bad signature gives 403).
- Developer-partner onboarding takes **4 to 6 weeks** (developer profile request, app client in Solution Provider Portal, SNS setup, activation). Business customers need an Amazon Business account, a group, order safeguards, a payment method, and the `AmazonBusinessOrderPlacement` role.
- Payment is whatever the customer put in Amazon Business (card or bank). Our VCC would be that payment method, which is awkward for per-order single-use cards [U].
- No dedicated sandbox described; API Explorer and a customer-side test mode only. Punchout also requires a compatible purchasing system and a punchout identity/secret [S].
- Verdict: impossible tonight; wrong tool for a consumer voice line.

---

## 5. Option 4: Virtual card issuers

### 5.1 Lithic (recommended issuer for tonight)
All [V] unless marked.
- **Sandbox:** self-serve. New accounts start in Sandbox; the Sandbox API key is on app.lithic.com/settings; "No approval is mentioned for the Sandbox." Sandbox base `https://sandbox.lithic.com` (the SDK maps `environment: 'sandbox'` to it). Fair-use: not for load or automated testing at scale.
- **Auth header:** the create-card page shows `Authorization: {Sandbox API key}` with no scheme prefix. (Privacy.com uses `Authorization: api-key KEY`; do not mix them.)
- **Create card:** `POST /v1/cards`. Body fields: `type` (`VIRTUAL` default, `PHYSICAL`, `SINGLE_USE`, `MERCHANT_LOCKED`, deprecated `UNLOCKED`/`DIGITAL_WALLET`), `spend_limit` (integer **cents**; 0 means no limit), `spend_limit_duration` (`TRANSACTION | MONTHLY | ANNUALLY | FOREVER`; the SDK types also include `DAILY`), `memo`, `state` (`OPEN | PAUSED`), `account_token` (required for programs that enroll users via `/account_holders`).
  - `MERCHANT_LOCKED` = "Card is locked to the first merchant that successfully authorizes the card."
  - `SINGLE_USE` = "Card is closed upon first successful authorization"; later purchases are declined, refunds still work; merchants may still send **force-post clearings** that Lithic cannot decline and that "may be subject to chargeback."
  - Response includes `token`, `pan`, `cvv`, `exp_month`, `exp_year` (PAN/CVV visible in Sandbox to all clients; in Production only to PCI-verified clients).
- **Simulate:** `POST /v1/simulate/authorize` body `{amount (cents, required), descriptor (1-25 chars, required), pan (required)}` plus optional `mcc`, `merchant_acceptor_id`, `merchant_acceptor_city|state|country`, `status`, `partial_approval_capable`, `pin`. Returns `{token, debugging_request_id}`. Then `POST /v1/simulate/clearing {token, amount}`, `/v1/simulate/void`, `/v1/simulate/return`. Accounts without ASA get a default $5,000 daily limit.
- **Observable outcomes (read from the SDK's published enums, `lithic@0.148.0`):** transaction `result` includes `APPROVED`, `UNAUTHORIZED_MERCHANT`, `USER_TRANSACTION_LIMIT`, `CARD_CLOSED`, `SINGLE_USE_RECHARGED`; `detailed_results` includes `CARD_SPEND_LIMIT_EXCEEDED`, `MERCHANT_LOCKED_CARD_ATTEMPTED_ELSEWHERE`, `SINGLE_USE_CARD_REATTEMPTED`, `MERCHANT_NOT_PERMITTED`. The docs' own over-limit example returns "Transaction exceeds user-set transaction limit."
- **What I could not verify [U]:** (1) What key the sandbox uses to decide "same merchant" for `MERCHANT_LOCKED` (`descriptor` vs `merchant_acceptor_id`); send both consistently. (2) Whether a fresh sandbox needs an account holder (`POST /v1/account_holders`, `workflow: "KYC_BASIC"`) or funding before a card will authorize; docs show `POST /v1/cards {"type":"VIRTUAL"}` working with just the key, and the simulate page lists no prerequisites. (3) Whether `simulate/authorize` with an unfunded program returns `INSUFFICIENT_FUNDS`; an ACH-funding-in-sandbox quickstart exists if so (`https://docs.lithic.com/docs/quick-start-ach-funding-in-sandbox.md`). Budget 15 min for these.
- **Retrieve result:** `client.transactions.retrieve(token)` or `GET /v1/transactions/{token}`; the SDK method for simulation is `client.transactions.simulateAuthorization({...})` [V].
- **SDK:** npm `lithic` (0.148.0 at time of check; `new Lithic({ apiKey, environment: 'sandbox' })`), also on PyPI as `lithic` [S for PyPI].
- **Production:** "contact Sales" for a production key; Lithic offers Processing (bring your own bank/BIN sponsor) vs Program Managed (Lithic + partner bank handle sponsorship, KYB, AML) [V]. A search snippet citing Lithic's guide puts business setup at about 2-3 days with incorporation docs, three months of bank statements, and 25%+ owners [S]; pricing unpublished [S].

### 5.2 Stripe Issuing (alternative; better for webhook-enforced policy)
- **Sandbox:** activate Issuing inside a Stripe sandbox in the Dashboard; US funding is by test **top-ups** (Dashboard or Top-ups API) before test transactions work [V testing page; activation step S].
- **Create:** `POST /v1/issuing/cardholders` (name, email, phone_number, status, type, individual[...], billing[address][...]) then `POST /v1/issuing/cards` (`cardholder, type=virtual, currency=usd, status=active`) [V].
- **Controls [V]:** `spending_controls[spending_limits][0][amount]` + `[interval]` (docs show `per_authorization`, `weekly` and `monthly`; I believe `daily`, `yearly`, `all_time` also exist but did not confirm [U]), `allowed_categories`, `blocked_categories`, `allowed_merchant_countries`, `blocked_merchant_countries`, `allowed_card_presences`. Default $500/day applies if unset. Can you lock to one merchant? **Merchant-ID controls are private preview** [V]. Without that, enforce the lock yourself in the `issuing_authorization.request` webhook (2-second timeout, payload includes `merchant_data.name`, `network_id`, `category_code`, and `card.metadata`) [V].
- **Test helpers [V]:** `POST /v1/test_helpers/issuing/authorizations` with `card, amount, authorization_method, merchant_data[category|city|country|name|network_id|postal_code|state]`; capture with `POST /v1/test_helpers/issuing/authorizations/{id}/capture`.
- **Single-use:** `lifecycle_controls[cancel_after][payment_count]=1` (see 3.2).
- **PAN:** `GET /v1/issuing/cards/{id}?expand[]=number&expand[]=cvc`; PCI advice is to use Issuing Elements; "if you're generating virtual cards for your own use, you're not required to attain PCI-DSS compliance for Issuing activity" while platforms issuing to users may be Service Providers [V].
- **Why not first choice:** more setup steps (cardholder, top-up, webhook endpoint) and the merchant lock needs custom code or a private-preview flag. Why it might win later: same account as SPT and payments, and real-time authorization is a richer policy surface.

### 5.3 Privacy.com API
Create card `POST /cards` (reference page `https://developers.privacy.com/reference/post_cards-1.md`): `type` (defaults `SINGLE_USE`; `MERCHANT_LOCKED`, `DIGITAL_WALLET`), `spend_limit` (cents), `spend_limit_duration`, `memo`, `state`, `funding_token`; response includes `pan` and `cvv`; header `Authorization: api-key KEY` [V]. Getting started page: every user must pass CIP verification before transacting, and you are responsible for all financial activity on the account [V]. API access requires Plus/Pro/Premium and sandbox is enabled afterwards [S]. Consumer-oriented, funded from a bank account; wrong shape for a per-order agent program. Skip.

### 5.4 Highnote [S]
GraphQL API, enterprise/contract-gated, April 2026 press release mentions single-use virtual cards for travel bookings. No agent-specific or self-serve sandbox details found. Skip.

---

## 6. Option 5: Browser-agent checkout (last resort)

- **Bot detection [V observation + S]:** Plain curl got Cloudflare 403 from four of five parts retailers (PartSelect, RepairClinic, eReplacementParts, SearsPartsDirect); AppliancePartsPros answered 200. A real browser with residential egress behaves differently, so this proves only that bare HTTP clients are blocked. Skyvern's docs say CAPTCHA solving is not guaranteed and Cloudflare challenges may need a residential ISP proxy [S]. Browserbase Free: no captcha solving and Verified identity "No"; Developer $20 adds auto captcha solving and Basic identity [V]. No published checkout completion rates exist [S].
- **PCI:** to type a card into a retailer, the agent must see a PAN. With a single-use VCC the blast radius is small, but the PAN is still in the model context and logs.
- **Terms of service and law [S]:** Amazon obtained a preliminary injunction against Perplexity's shopping agent in March 2026 (N.D. Cal., CFAA and a California statute); the Ninth Circuit reversed it in August 2026, finding Amazon unlikely to succeed on the CFAA claim. Reporting says the broader question is unsettled. Retailer ToS commonly prohibit bots regardless [U].
- **Sandbox mismatch:** a Lithic/Stripe sandbox PAN cannot be typed into a live retailer checkout.
- Stagehand: npm `@browserbasehq/stagehand` (4.3.0) [V]. Verdict: do not build tonight.

**Note on the part itself [S, search snippets]:** WP3392519 listed at $53.85 at SearsPartsDirect, $23.99 (genuine) and $5-8 (aftermarket multi-packs) on Walmart, about $11-13 on eBay. Amazon, PartSelect, RepairClinic and AppliancePartsPros listings were not surfaced. The "$10-15" target only matches eBay/aftermarket; pick the demo SKU deliberately.

---

## 7. Recommendation

### 7.1 What to build in ~2 hours: "Mandate card + staged order"

**Claim to make on stage:** "When Dorothy says 'order it', Fixie mints a one-purchase, merchant-locked virtual card limited to the approved quote. The issuer, not our code, declines anything else." Say "sandbox" and "simulated merchant" out loud. Do not say a real part was bought.

Sequence (all steps verified individually; the end-to-end chain is not):
1. **Quote approved** by voice (existing flow). Compute `capCents = round(quote_total * 100)` including shipping and tax.
2. **Mint card.** `POST https://sandbox.lithic.com/v1/cards` `{"type":"MERCHANT_LOCKED","spend_limit":capCents,"spend_limit_duration":"TRANSACTION","memo":"fixie:<callId>:WP3392519"}` (header `Authorization: <LITHIC_API_KEY>`). Keep `token`, `pan`, `cvv`, `exp_*` server-side only; never log or speak the PAN.
3. **Place the order (staged).** Rye staging: `POST /api/v1/checkout-intents` for the Shopify test product (`rye-test-store.myshopify.com/products/product-published-to-rye-channel`) with Dorothy's address, poll to `awaiting_confirmation`, show `offer.cost.total` on screen, then `POST /api/v1/checkout-intents/{id}/confirm` with `{paymentMethod:{type:"stripe_token",stripeToken:"tok_visa"}}`, poll to `completed`. Pass `constraints.maxTotalPrice` as a second, software-side cap (units unverified; test first).
4. **Settle on the card (simulated).** `POST /v1/simulate/authorize` `{"amount":<offer.total cents>,"descriptor":"WHIRLPOOL PARTS SIM","pan":"<pan>"}` then `GET` the transaction: expect `APPROVED`. Then `POST /v1/simulate/clearing`.
5. **Guardrail proofs (the money shot):** (a) authorize 2x the cap: expect decline `CARD_SPEND_LIMIT_EXCEEDED`; (b) authorize at a different descriptor/merchant id: expect `MERCHANT_LOCKED_CARD_ATTEMPTED_ELSEWHERE` [U on trigger key]; (c) re-authorize at the original merchant after the first: `SINGLE_USE_CARD_REATTEMPTED` applies to SINGLE_USE cards only, so if you want this beat, mint a `SINGLE_USE` card instead of `MERCHANT_LOCKED` for that run, or do both in two takes.
6. **Kill switch:** `PATCH /v1/cards/{token}` `{"state":"PAUSED"}` (or `CLOSED`) then show the next authorization declined (`CARD_PAUSED`/`CARD_CLOSED`). The PATCH-update path is standard Lithic but I did not open its page [U]; confirm in the reference.
7. **Audit record:** write a mandate JSON (call id, transcript hash, part, cap, card token, Rye intent id, auth tokens, result) and show it.

Why this beats alternatives for tonight:
- **vs Stripe Issuing sandbox:** fewer prerequisites (no cardholder, top-up, webhook server) and the merchant lock is a native card type rather than custom code. Stripe is the fallback if Lithic sandbox needs unexpected funding/account-holder setup.
- **vs Stripe SPT:** SPT is the better *story* (agent-native, externally enforced `usage_limits`, revocable) but nothing that sells parts accepts it, and Rye does not take it. Keep it as an optional 25-minute add-on beat using the seller test helper and a revoke, as in the prior round's plan.
- **vs Crossmint:** Agent Checkouts has no staging; using it means a real production purchase and a sales/KYB gate.

**Honest caveat to put in the pitch notes:** the Lithic card and the Rye order are separate sandboxes. The card is never presented to Rye; we simulate the merchant charge on the card with the amount Rye quoted. The fidelity is in the *policy objects* (cap, lock, single use, kill switch, audit), not in a live money movement.

### 7.2 Stretch: one real order (only if time remains and Rye production is self-serve)
Create a production Rye account, use Rye's live Stripe publishable key to tokenize the founder's own card, `POST /api/v1/checkout-intents` (production host) for a ~$12 listing with `constraints.maxTotalPrice` set, confirm, and observe `completed`. Unverified gates: whether production needs approval, whether Rye can reach the chosen listing, and what `maxTotalPrice` units are. Do it with a pre-checked listing on Amazon or Shopify, not a Cloudflare-fronted parts site. This uses the founder's real card (not a VCC).

### 7.3 Production path
1. **Issuer:** Lithic Program Managed (sales conversation + KYB; secondary sources say days) or Stripe Issuing (apply; "Cards for your platform" for consumer cardholders needs "Contact Stripe"; PM-from-Issuing-card is private preview). Fund each card just in time from the user's authorized amount (collect first via PaymentIntent with manual capture, then fund); funding design is [U] and needs a compliance review because Fixie would hold user funds.
2. **Order rail, ranked:**
   - **Phone order by the voice agent itself:** Fixie already calls suppliers. For parts counters, the agent can read a freshly minted `SINGLE_USE`/`MERCHANT_LOCKED` card over the call (card-not-present phone order). This is my inference, not researched; it needs PCI and call-recording policy review (do not record or transcribe the PAN), and it is the only path I found that reaches counters with no API. Check supplier acceptance.
   - **Rye** for any listing on Amazon, Shopify, or a reachable site: `stripe_token` path (Rye is MOR, Fixie never touches PAN) or `basis_theory_token` carrying the VCC (needs Rye to confirm VCCs are accepted).
   - **Crossmint Agent Checkouts** with Agent Cards (Visa/Mastercard one-time numbers) after Order Form + KYB, for "any website" with a `maxCost` constraint.
   - **Shopify UCP/Checkout MCP** where the parts seller is on Shopify and Fixie earns a trust tier.
   - **Amazon Business Ordering API:** only if Fixie becomes a registered solution provider (4-6 week onboarding).
3. **PCI posture:** with Lithic/Stripe Embedded/Elements display, Fixie never holds PANs on its servers. Retrieving raw PAN via API requires PCI verification in Lithic production and encryption/handling controls in Stripe.
4. **Controls to add:** webhook/ASA-based real-time decisioning (Lithic Auth Stream Access or Stripe `issuing_authorization.request`), idempotency key per call, refund/return path (Rye Returns API; card refunds still land on a closed single-use card), and disputes (merchant keeps refunds/disputes per Stripe's SPT docs).

---

## 8. Accounts and keys the founder must create (for 7.1)

| # | Account | Where | Key/secret | Env var | Notes |
|---|---|---|---|---|---|
| 1 | Lithic (Sandbox) | `https://lithic.com/signup` then `https://app.lithic.com/settings` | Sandbox API key | `LITHIC_API_KEY` | Base `https://sandbox.lithic.com/v1`. Header `Authorization: <key>`. No approval mentioned. Optional: `LITHIC_WEBHOOK_SECRET` if you add webhooks |
| 2 | Rye (Staging) | Register at the staging console (`console.commerce.staging.jolly.dev/register`; reach it from rye.com to be safe) | Staging API Key from Account tab (`RYE/staging-...`) | `RYE_API_KEY` (or `CHECKOUT_INTENTS_API_KEY` for the SDK) | Base `https://api.commerce.staging.jolly.dev`. Header `Authorization: Basic <key>`. Test token `tok_visa`, no Stripe key needed |
| 3 (optional) | Stripe account, Sandbox | `https://dashboard.stripe.com/register` | `sk_test_...` secret key | `STRIPE_SECRET_KEY` | Only for the optional SPT beat. Test seller profile `profile_test_61TU90nIeGjU7NNVXA6TU90m7ISQWsBxpcx9lASWWXTk`; version header `Stripe-Version: 2026-09-30.preview`; confirm preview access on first call |
| 4 (stretch only) | Rye (Production) + Rye's live Stripe publishable key | production console | Production API key (`RYE/production-...`), Rye's live `pk_live_...` | n/a | Real money; use a founder card; gating unverified |

Not needed tonight: Crossmint, Privacy.com, Highnote, Violet, Shopify partner/agent profile, Amazon Business, Visa/Mastercard developer accounts, Browserbase.

Packages: `npm i lithic checkout-intents` (add `stripe` only for item 3).

---

## 9. Source URLs

Lithic: `https://docs.lithic.com/docs/cards`, `https://docs.lithic.com/reference/postcards`, `https://docs.lithic.com/reference/postsimulateauthorize`, `https://docs.lithic.com/docs/simulating-transactions.md`, `https://docs.lithic.com/docs/create-card.md`, `https://docs.lithic.com/docs/get-api-key.md`, `https://docs.lithic.com/docs/sign-up.md`, `https://docs.lithic.com/docs/create-account-holder.md`, `https://docs.lithic.com/docs/po-vs-pm.md`, `https://docs.lithic.com/llms.txt`; SDK `https://www.npmjs.com/package/lithic`; javadoc `https://javadoc.io/static/com.lithic.api/lithic-java/0.131.0/com/lithic/api/models/CardCreateParams.html`.

Rye: `https://docs.commerce.jolly.dev/` (redirect target of `https://docs.rye.com/`), `.../llms.txt`, `.../api-v2/example-flows/simple-checkout.md`, `.../api-v2/environments.md`, `.../api-v2/account-registration.md`, `.../api-v2/payment-providers.md`, `.../api-v2/payment-providers/stripe.md`, `.../api-v2/payment-providers/basis-theory.md`, `.../api-v2/api-comparison.md`, `.../api-v2/developer-notes.md`, `.../api-v2/go-live.md`, `.../api-v2/testing/test-products.md`, `.../api-v2/api-reference/checkout-intents/purchase-product.md`, `.../api-v2/sdk.md`; SDK `https://www.npmjs.com/package/checkout-intents`.

Stripe: `https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=agent`, `https://docs.stripe.com/api/shared-payment/granted-token/create`, `https://docs.stripe.com/api/shared-payment/issued-token`, `https://docs.stripe.com/issuing/agents.md`, `https://docs.stripe.com/issuing/agents/programmatic-checkout.md`, `https://docs.stripe.com/issuing/controls/lifecycle-controls.md`, `https://docs.stripe.com/issuing/controls/spending-controls.md`, `https://docs.stripe.com/issuing/cards/virtual.md`, `https://docs.stripe.com/issuing/testing.md?testing-method=with-code`, `https://docs.stripe.com/treasury/access.md`, `https://support.stripe.com/questions/stripe-issuing-test-mode-configurations-and-differences-vs-live-mode`.

Crossmint: `https://docs.crossmint.com/agents/agent-checkouts-quickstart`, `https://docs.crossmint.com/agents/payment-methods/cards/create-virtual-card`, `https://docs.crossmint.com/solutions/ai-agents/agentic-commerce/payment-methods`.

Shopify: `https://shopify.dev/agents`, `https://shopify.dev/docs/agents/get-started/quickstart`.

Amazon Business: `https://docs.business.amazon.com/docs/ordering-api`.

Privacy.com: `https://developers.privacy.com/docs/getting-started`, `https://developers.privacy.com/reference/post_cards-1.md`, `https://developers.privacy.com/docs/cards.md`, `https://support.privacy.com/hc/en-us/articles/38299485169559-What-is-the-Privacy-API`.

Browser agents: `https://docs.browserbase.com/account/billing/plans.md`, `https://skyvern.com/docs/developers/features/captcha-and-bot-bypass`; Amazon v. Perplexity coverage: `https://news.bloomberglaw.com/ip-law/amazon-wins-court-order-blocking-perplexitys-ai-shopping-bots`, `https://mediapost.com/publications/article/413382/judge-bans-perplexity-shopping-agent-from-amazon.html`.

Networks / others: `https://developer.mastercard.com/mastercard-agent-pay/documentation/tutorial-and-guides/`, `https://eco.com/support/en/articles/14845484-visa-intelligent-commerce-explained`, `https://docs.violet.io/guides/quickstart/overview` (404 when fetched), `https://businesswire.com/news/home/20260430085366/en/Highnote-Powers-a-New-Era-of-Commercial-Card-Issuing-for-Online-Travel`.

Retailer fingerprint test: HTTP HEAD/GET of `https://www.appliancepartspros.com/`, `www.partselect.com`, `www.repairclinic.com`, `www.ereplacementparts.com`, `www.searspartsdirect.com` on 2026-10-24 from the research host.

---

## 10. Open items to resolve in the first 20 minutes tonight
1. Lithic sandbox: does a bare `POST /v1/cards` plus `simulate/authorize` return `APPROVED` without an account holder or funding? If not, follow the ACH-funding-in-sandbox quickstart.
2. Lithic `MERCHANT_LOCKED`: does the lock key off `descriptor`, `merchant_acceptor_id`, or both? Send a repeatable pair.
3. Rye: confirm staging host and signup by navigating from rye.com; confirm `maxTotalPrice` units with one test product.
4. Rye: confirm single-step purchase path (`/api/v1/` vs `/v1/`) against the OpenAPI file.
5. Decide whether the pitch shows SPT (needs Stripe preview-version check) or sticks to Lithic + Rye.
