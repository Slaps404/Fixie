# #16 Real ordering: online quotes + a capped virtual card on "order it"

**Owner:** Lane A (the orchestrator owner applies the steps below; nothing here edits `orchestrator.ts`, `prompts.ts`, `guards.ts`, or `types.ts`).
**Research:** `docs/review/ordering-research.md` (sources, verified/secondary/unverified labels).

## What exists now (new files only)

| File | What it does | Verified |
|---|---|---|
| `server/src/commerce/online-quotes.ts` | `getOnlineQuotes(part)`. Runs 4 parallel Claude `web_search_20250305` + `web_fetch_20250910` lookups (Amazon, eBay, Walmart + Home Depot, RepairClinic + PartSelect + AppliancePartsPros + Sears). Keeps an offer only if its URL host came back in a real search or fetch result. Computes `identicalPart` in code: the part number must match `parts.isIdentical` and the listing must be genuine OEM. Unknown shipping becomes a deliberately high $9.99, labeled `estimated`. Falls back to `data/online-prices.json`, labeled `cached`. Never throws. | Live: 10 to 14 verified listings in 12 to 22 s across up to 7 stores, over 5 runs (`npm run quotes:online`). |
| `server/data/online-prices.json` | Cached fallback: 15 listings merged from live runs on 2026-10-24, each with its URL. Refresh it with `npm run quotes:online -- --write-cache`. | Yes |
| `server/src/commerce/place-order.ts` | `placeOrder({job, quote, approvedBy})`. Issues a virtual card capped at `quote.landedTotal`, checks out, emits `vcc_issued` and `order_placed` (last4 only), and is idempotent per job + quote. `revokeCards(jobId)` serves the kill switch. | Unit tests |
| `server/src/commerce/lithic.ts` | Lithic issuer (`MERCHANT_LOCKED`, `spend_limit` = cents, `spend_limit_duration: FOREVER`). The sandbox "merchant" is Lithic's authorization simulator, run under that store's card-statement name (`AMAZON MKTPL`, `EBAY O`, `WALMART.COM`, …). | **Not run yet: needs `LITHIC_API_KEY`** |
| `server/src/commerce/types.ts` | `CardSecret` holds the PAN in private fields. JSON, `inspect`, and string conversion all print `[card redacted]`. | Unit tests |
| `server/scripts/order-test.ts` | `npm run order:test` orders from the $13.05 phone quote. `npm run order:test -- --online` orders from the best web quote (Amazon first). Then it proves the issuer declines a second merchant and 1 cent over the cap, and closes the card. | Online half verified (picked eBay at $13.24); the card half needs the key |
| `server/test/commerce.test.ts`, `server/test/online-quotes.test.ts` | 11 tests: the cap, the merchant lock, decline closes the card, idempotency, kill switch, no PAN anywhere, unverified URLs dropped, aftermarket never identical, cached fallback, online quotes pass `guards.checkQuote` like phone quotes. | `npm test` |

## Keys the founder must create

1. **`LITHIC_API_KEY`** (required for the card beat, about 10 min). Sign up at https://lithic.com/signup, then open https://app.lithic.com/settings → API keys → **Sandbox** key, and add it to `server/.env`. Then run `npm run order:test`. Expect 3 PASS lines.
2. *(Optional)* **`RYE_API_KEY`**, Rye staging (Universal Checkout, $149/mo, first month free). Rye is the production-shaped path to Amazon and Shopify orders. Not wired up. See "Production path".
3. *(Optional)* **`SERPAPI_API_KEY`**, if Amazon must show a live price. Amazon hides prices from web search ("Click to see price"), so the live lane finds Amazon listings but can't price them. In this run they were all aftermarket multi-packs. Not wired up.

`ANTHROPIC_API_KEY` (already set) powers the live online lookup.

## What the demo can honestly claim

- "Fixie priced the exact part at 7 web stores while it phoned suppliers, and ranked both on landed total." This is true and live.
- "When Dorothy said 'order it', Fixie issued a single-merchant virtual card capped at $13.05. The card issuer, not our code, declines anything else." This is true in the Lithic **sandbox**. Say "sandbox" out loud.
- Do **not** claim a real Amazon or eBay order was placed. The merchant charge is Lithic's authorization simulator, run under the store's card-statement name. Sandbox cards can't buy anything real (Stripe and Lithic docs, see research §0).

## Integration steps (for the orchestrator owner)

### 1. `types.ts` (additive)
- Add `'vcc_issued' | 'order_placed' | 'online_quotes'` to `FixieEventType`.
- `Quote.source`: add `'online'`. Add `url?: string; freshness?: 'live' | 'cached'` to `Quote`.
- Then delete the two `as FixieEventType` casts in `commerce/place-order.ts` and the `as Quote['source']` cast in `commerce/online-quotes.ts`.

### 2. Online quotes during sourcing (`orchestrator.ts`)
```ts
import { getOnlineQuotes, toQuote } from './commerce/online-quotes.ts';
const onlinePending = new Set<string>();   // jobIds with a web lookup still running

// in startSourcing(), right after the DIAGNOSED → SOURCING move and BEFORE the dial loop:
if (job.part) {
  onlinePending.add(jobId);
  void getOnlineQuotes(job.part, { timeoutMs: (config.caps.sourcingTimeoutSeconds - 15) * 1000 })
    .then(({ quotes, freshness, error }) => {
      const cur = jobs.get(jobId);
      if (!cur || cur.state !== 'SOURCING') return;
      const accepted = quotes.map(toQuote).map((q) => {
        const v = guards.checkQuote(cur, q);
        if (v && !v.ok) q.rejectedReason = v.detail ?? 'Rejected by guard';
        return q;
      });
      jobs.update(jobId, (j) => j.quotes.push(...accepted));
      const usable = accepted.filter((q) => !q.rejectedReason);
      ev(cur, 'online_quotes', {
        count: quotes.length, usable: usable.length, freshness, error,
        best: usable[0] && { supplier: usable[0].supplier, landedTotal: usable[0].landedTotal, url: usable[0].url },
        reason: `Checked ${new Set(quotes.map((q) => q.merchant)).size} web stores (${freshness}); ${usable.length} identical, in stock, under budget`,
      }, null);
      // Board readability: one `quote` event per store, its best usable offer only.
      for (const q of usable.filter((q, i, a) => a.findIndex((x) => x.supplier === q.supplier) === i).slice(0, 4)) {
        ev(cur, 'quote', { supplier: q.supplier, vendorId: q.vendorId, price: q.price, shipping: q.shipping, landedTotal: q.landedTotal, inStock: q.inStock, identicalPart: q.identicalPart, source: 'online', freshness, url: q.url, approvedBy: 'code', reason: `${q.supplier} web listing: ${usd(q.landedTotal)} landed` }, null);
      }
    })
    .catch((err) => fail('onlineQuotes', err, jobId))
    .finally(() => { onlinePending.delete(jobId); evaluateCallback(jobId, false); });
}
```
- In `evaluateCallback`, add `if (!timedOut && onlinePending.has(jobId)) return;` right after the `SOURCING` state check, so the callback waits for the web lane, but never past the sourcing timeout.
- `rank()` / `usableQuotes()` need no change: web quotes are `Quote`s, carry `identicalPart` computed in code, and already went through `guards.checkQuote`. So the $40 cap and "identical part" apply to both lanes.
- Add `onlinePending.clear()` to `resetAll()`.
- `callbackPrompt` says "Do not name the supplier". That's fine for both lanes. If you want "from eBay", read `best.supplier` when `best.source === 'online'`.

### 3. A real (sandbox) order on "order it" (`orchestrator.ts`, `handleOrderDecision`)
After the `order_confirmed` emit, which stays first because the tool result must return in under 1 s:
```ts
import { placeOrder, revokeCards, resetOrders } from './commerce/place-order.ts';

if (process.env.COMMERCE === 'lithic') {
  void placeOrder({ job: jobs.get(job.id) ?? job, quote: best, approvedBy: approver })
    .then((r) => { if (r.status !== 'placed') note(job, `Order declined by the card issuer: ${r.reason}. Nothing was charged.`, simFlag(job, ctx)); })
    .catch((err) => fail('placeOrder', err, job.id));
}
```
- Set `mockOrder: process.env.COMMERCE !== 'lithic'` in the `order_confirmed` payload.
- Kill switch, in `stop()` after the calls end: `void revokeCards(jobId).then((l4) => l4.length && note(job, \`Closed virtual card ···${l4.join(', ···')} at the issuer.\`, false)).catch(() => {});`
- In `resetAll()`, call `resetOrders()`.
- Env: `COMMERCE=lithic` plus `LITHIC_API_KEY` in `server/.env`, then restart through `server/scripts/safe-restart.sh`. With `COMMERCE` unset, the behavior is today's mock order, unchanged.

### 4. Board (`web/`, friend's lane)
- `vcc_issued`: "Virtual card ···{last4} · capped at ${limit} · {lock}" with a SANDBOX badge when `simulated`.
- `order_placed`: "Paid ${total} at {merchant} · order {orderId}" plus a link when `url` is set.
- `online_quotes`: "Checked {n} web stores ({freshness})". Web `quote` events carry `source:'online'` and `url`, so give them a globe icon next to the phone quotes.

### 5. Verify after integration
- `npm test` (58+ tests) and `npm run verify`.
- In a DRY_RUN instance on a port of 3200 or higher, run sim intake. Expect an `online_quotes` event to land before `best_deal`, and `best_deal` to rank web and phone quotes together. With the sim roster, PartsDirect at $13.05 still wins; eBay at about $13.24 is the runner-up.
- With `COMMERCE=lithic`: after "order it", expect `order_confirmed` → `vcc_issued` → `order_placed` with `last4` and no PAN in `data/events.jsonl` (`grep -E '[0-9]{15,16}' data/events.jsonl` prints nothing).

## Security properties (enforced where?)

| Property | Enforced by |
|---|---|
| Spend never exceeds the approved landed total | Lithic `spend_limit` (issuer auth engine) |
| Only one merchant can charge the card | Lithic `MERCHANT_LOCKED` |
| Kill switch stops money | `PATCH /v1/cards/{token} {state: CLOSED}` (issuer) |
| The card is spoken only on the order call, to the winning vendor | `read_card` (server) checks the vendor, the roster number, approval, and the confirmed total; the callback and delivery prompts never receive card data. See "Phone order lane" |
| The card is never logged or emitted | `CardSecret` private fields with redacting `toJSON`/`inspect`; events carry last4 only; Lithic error bodies have long digit runs masked |
| No order without a human yes | `placeOrder` rejects any `approvedBy` other than `user_voice` or `caregiver`; it is only called from `record_order_decision approved:true` |
| No order on a rejected or non-identical quote | `placeOrder` refuses `rejectedReason`, `!identicalPart`, and `!inStock` before issuing a card |

Known gap: the landed total excludes sales tax. A real checkout would add tax and be declined at the cap. Before production, quote tax-inclusive totals, or cap at total × (1 + local rate).

## Production path

1. **Card:** Lithic Program Managed or Stripe Issuing (both need sales and KYB). Fund each card just in time from the user's authorized amount.
2. **Order rail:**
   - Rye Universal Checkout for Amazon, Shopify and Best Buy, with Rye as merchant of record. Forwarding our VCC through Basis Theory is undocumented and must be confirmed with Rye.
   - Crossmint Agent Checkouts after KYB (network tokens; no staging).
   - Amazon Business Ordering API takes 4 to 6 weeks to onboard.
   - Parts counters with no API: the phone order lane below, paying with a per-order virtual card.
3. **Price freshness:** add SerpAPI's Amazon/Google Shopping engine, or Rye product lookup, for Amazon prices. Keep the URL-host check either way.

## Phone order lane: Fixie reads the card to the winning vendor

Founder requirement, relayed by Lane A. Built in new files only.

| File | What it does |
|---|---|
| `server/src/commerce/vault.ts` | `createVault().put(card)` → `{token, last4}`. Encrypts with AES-256-GCM, key `CARD_ENC_KEY` (32 bytes, base64), the token as AAD, a fresh 12-byte IV per card, and the file `data/vault.json` at mode 0600 (gitignored). Accepts only `4242424242424242` unless `ALLOW_REAL_CARDS=1`. Luhn, expiry, and CVC are validated. `revealForCall(token)` returns a `CardSecret` (never serializes) and is called only from `handleReadCard`. |
| `server/src/commerce/order-call.ts` | `orderCallPrompt(job, vendorName, last4, shipTo)` (the prompt has no PAN), `ORDER_TOOL_DEFS` (`read_card`, `record_order_result`), `ORDER_CALL_OVERRIDES`, `armOrderCard`/`disarmOrderCard`, `handleReadCard`, `handleOrderResult`, `redactPan`. |
| `server/scripts/vault-put.ts` | `npm run vault:put`, then paste `4242424242424242 12/30 123` on stdin, never argv. Prints `ORDER_CARD_TOKEN=card_…` for `server/.env`. |
| `server/test/vault.test.ts` | 8 tests: nothing on disk in plaintext, round-trip, test-card gate, tamper and wrong-key fail, read_card gates, last4-only audit, disarm after the order, redaction, Vapi overrides. |

**Why a tool instead of putting the card in the prompt.** "Read it only after they confirm the total" and "only to the winning vendor" are then enforced by `handleReadCard`, not by the LLM. The PAN enters the model context only after the gate passes. `handleReadCard` refuses, returning "Do not read any card details…", when any of these holds:
- the job isn't `ORDERED`, or no card is armed;
- the call's `vendorId` isn't `bestDeal.vendorId`, or the lane isn't `supplier`;
- the call's `to` isn't that vendor's roster phone;
- the vendor's stated `totalQuoted` is missing or above `bestDeal.landedTotal`;
- expiry or CVC is requested before the number;
- the number has already been read 3 times on this call.

It releases the number as `4 2 4 2, 4 2 4 2, 4 2 4 2, 4 2 4 2`. Expiry and CVC go out only on a separate request.

### Integration steps (Lane A)
1. **`contracts.ts`:**
   - `ToolName` += `'read_card' | 'record_order_result'`.
   - `AssistantSpec` += `purpose?: 'quote' | 'order'`.
   - `CallRequest` += `purpose?: 'order'`.
   - **`types.ts`:** `FixieEventType` += `'card_read'`.
2. **`vapi/webhook.ts`:** add both names to `TOOL_NAMES`.
3. **`dialer.ts`:** pass `req.purpose` into the `AssistantSpec` it builds.
4. **`vapi/assistants.ts` `buildAssistant`:** when `spec.purpose === 'order'`:
   - prompt `orderCallPrompt(spec.job, spec.vendor!.name, vault.last4(process.env.ORDER_CARD_TOKEN!) ?? '', process.env.ORDER_SHIP_TO ?? 'Dorothy, San Diego, CA 92093')`;
   - tools are the two `ORDER_TOOL_DEFS` (same function/server shape as `toolsFor`) plus `{type:'endCall'}`;
   - spread `ORDER_CALL_OVERRIDES` into the assistant;
   - drop `'transcript[transcriptType="final"]'` from `serverMessages`, so no live transcript webhooks are sent for this call.
5. **`orchestrator.ts`:**
   - In `handleOrderDecision`, after `order_confirmed`, when `process.env.COMMERCE === 'phone'`, `ORDER_CARD_TOKEN` is set, and `!best.vendorId.startsWith('online:')`:
     `armOrderCard(job.id, token); void place(jobs.get(job.id)!, { lane: 'supplier', vendorId: best.vendorId, maxSec: 150, purpose: 'order' });`
     The 2-calls-per-vendor cap allows exactly this one order call.
   - In the `handleTool` switch:
     - `case 'read_card': return handleReadCard(job, ctx, e.args, { vault, rosterPhone: (id) => safeRoster()?.suppliers.find((s) => s.id === id)?.phone, onRelease: (r) => ev(job, 'card_read', { part: r.part, last4: r.last4, vendorId: r.vendorId, callId: r.callId, reason: \`Read the card ending ${r.last4} (${r.part}) to the approved vendor after they confirmed the total\` }, ctx) });`
     - `case 'record_order_result': { const { reply, event } = handleOrderResult(job, ctx, e.args, vault.last4(token) ?? ''); ev(job, 'order_placed', event, ctx); return reply; }`
   - **Redaction:** in the transcript branch of `onCallEvent`, use `const text = redactPan(e.text)` for the `ev(...)` and the safety check. Do the same for any stored `e.transcript` from `end-of-call-report`.
   - In `stop()`, call `disarmOrderCard(jobId)`. In `resetAll()`, clear armed cards (`disarmOrderCard` per job, or add a `resetArmed()`).
6. **`vapi/sim.ts`:** the supplier sim script plays a quote call. For `purpose:'order'` it needs an order script:
   - say "That's $13.05 with shipping";
   - call `read_card {part:'number', totalQuoted:13.05}`;
   - say "Got it, order PD-1042";
   - call `record_order_result {placed:true, orderNumber:'PD-1042', total:13.05}`.
7. **Verify (DRY_RUN instance, port ≥ 3200):** run the sim through "order it", then check:
   - expect the events `card_read` (3× at most, last4 only) and `order_placed {channel:'phone', last4:'4242'}`;
   - `grep -E '4 ?2 ?4 ?2 ?4 ?2 ?4 ?2' data/events.jsonl` prints nothing.

## Card security (what tonight proves, and what production needs)

**Tonight (test card only):**
- **Stored:** AES-256-GCM at rest; the key lives only in env; tokens and last4 everywhere else.
- **Released:** by the server (vendor, roster number, approval, and total-at-or-under all checked) and audited as `card_read` events with last4 only.
- **Vapi side:** `recordingEnabled:false`, `loggingEnabled:false`, `transcriptPlan.enabled:false`, `compliancePlan.pciEnabled:true` (field names from docs.vapi.ai/security-and-privacy/pci; not yet seen on a live call).
- **Our side:** stored transcripts pass through `redactPan`.

**What still sees the number (be honest about it):**
- the vendor, by design;
- Vapi's transcriber, which hears the vendor repeat it;
- the LLM provider behind Vapi (the `read_card` tool result is in the model context);
- the TTS provider (it speaks the digits);
- our process memory: the tool-result caches in `webhook.ts` and `orchestrator.ts` until `/demo/reset`; never written to disk.

Vapi's PCI page also warns that tool results carry forward in conversation context.

**Production path:**
1. **A virtual card per order, never a stored real card.** On "order it", issue a Lithic `SINGLE_USE` (or `MERCHANT_LOCKED`) card with `spend_limit` = the approved total, plus tax, in cents. Read *that* card to the vendor and close it after the charge. A leaked transcript then holds a dead number capped at about $14. `placeOrder`/`lithic.ts` already issue this card; the order call would read its PAN instead of the vault's.
2. **PCI scope.** Speaking a PAN through our stack puts the voice pipeline in PCI DSS scope: SAQ D for a merchant or service provider handling cardholder data, every vendor in the audio path PCI-attested, and no PAN in logs, analytics, or backups.
   - Smaller scope: a PCI-compliant voice provider configuration (Vapi PCI mode with PCI-compliant model, transcriber, and voice options; Vapi doesn't list them, so confirm with them).
   - Or take the PAN out of the LLM entirely: have the TTS read it through a server-side "say" injection (Vapi `controlUrl` `say` message) instead of a tool result.
3. **Key management.** Move `CARD_ENC_KEY` to a KMS (AWS KMS or GCP KMS envelope encryption) with rotation. Better still, don't hold real PANs at all: use issuer-hosted card display, or a vault such as Basis Theory or VGS that forwards the PAN to the issuer or merchant.
