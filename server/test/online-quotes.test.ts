import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { getOnlineQuotes, liveOnlineQuotes, SHIPPING_ESTIMATE_USD, toQuote } from '../src/commerce/online-quotes.ts';
import { guards } from '../src/guards.ts';
import type { Job, PartInfo } from '../src/types.ts';

const part: PartInfo = { partNumber: 'WP3392519', name: 'Dryer thermal fuse', crossRefs: ['3392519', 'AP6008325'], safety: 'diy_with_caution', safetyNote: '', techVisitCost: 200, installSteps: [] };

const offer = (o: Record<string, unknown>) => ({ merchant: 'Walmart', url: 'https://www.walmart.com/ip/1', price: 8.7, shipping: 6.99, shippingSource: 'listing', inStock: true, partNumberShown: 'WP3392519', genuine: true, eta: null, ...o });

/** Fake Messages client: one search result block for walmart.com, then record_offers with the given offers. */
function fakeClient(offers: unknown[]): Anthropic {
  return {
    messages: {
      create: async () => ({
        stop_reason: 'tool_use',
        content: [
          { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://www.walmart.com/ip/1', title: 't', encrypted_content: '', page_age: null }] },
          { type: 'tool_use', id: 't1', name: 'record_offers', input: { offers } },
        ],
      }),
    },
  } as unknown as Anthropic;
}

test('live lookup keeps only offers whose host came back from a real search, and computes landed total', async () => {
  const qs = await liveOnlineQuotes(part, 5000, fakeClient([offer({}), offer({ merchant: 'Amazon', url: 'https://www.amazon.com/dp/MADEUP' })]));
  assert.ok(qs.length > 0);
  assert.ok(qs.every((q) => q.url.includes('walmart.com')), 'an Amazon URL that no search returned is dropped as unverified');
  assert.equal(qs[0].landedTotal, 15.69);
  assert.equal(qs[0].identicalPart, true);
  assert.equal(qs[0].freshness, 'live');
});

test('aftermarket or wrong-number listings are never identical; unknown shipping is padded, not zero', async () => {
  const qs = await liveOnlineQuotes(part, 5000, fakeClient([
    offer({ url: 'https://www.walmart.com/ip/2', genuine: false }),
    offer({ url: 'https://www.walmart.com/ip/3', partNumberShown: 'ER3392519X' }),
    offer({ url: 'https://www.walmart.com/ip/4', shipping: null, shippingSource: 'unknown' }),
  ]));
  const by = (u: string) => qs.find((q) => q.url.endsWith(u))!;
  assert.equal(by('/2').identicalPart, false);
  assert.equal(by('/3').identicalPart, false);
  assert.equal(by('/4').shipping, SHIPPING_ESTIMATE_USD);
  assert.equal(by('/4').shippingSource, 'estimated');
});

test('toQuote output goes through the same budget/identical guard as a phone quote', () => {
  const q = toQuote({ merchant: 'Walmart', vendorId: 'online:walmart', price: 11.64, shipping: 9.99, shippingSource: 'estimated', landedTotal: 21.63, inStock: true, url: 'https://www.walmart.com/ip/45031124', eta: null, partNumberSaid: 'WP3392519', genuine: true, identicalPart: true, source: 'online', freshness: 'live', fetchedAt: '2026-10-24T23:20:00Z' });
  const job = { part, kind: 'consumer' } as Job;
  assert.equal(guards.checkQuote(job, q), null, '$21.63 identical, in stock: accepted under the $40 cap');
  assert.equal(guards.checkQuote(job, { ...q, landedTotal: 63.84 })?.kind, 'budget');
});

test('getOnlineQuotes falls back to the cached, sourced table and labels it', async () => {
  const r = await getOnlineQuotes(part, { live: false });
  assert.equal(r.freshness, 'cached');
  assert.ok(r.quotes.length > 0, 'data/online-prices.json has WP3392519 listings');
  assert.ok(r.quotes.every((q) => q.freshness === 'cached' && q.url.startsWith('https://')));
});
