// One sandbox order end to end: issue a Lithic sandbox virtual card capped at the dryer quote's landed total,
// charge it at the supplier through Lithic's authorization simulator, then prove the issuer (not Fixie) blocks
// a second merchant and anything over the cap. Usage: npm run order:test [-- --online]
// --online orders from the best web quote instead (live Claude web search, cached table as fallback), Amazon first.
import 'dotenv/config';
import { getOnlineQuotes, toQuote } from '../src/commerce/online-quotes.ts';
import { chargeSimulated, lithicIssuer, lithicSimulatedMerchant } from '../src/commerce/lithic.ts';
import { placeOrder, type CommerceDeps } from '../src/commerce/place-order.ts';
import type { Cents, IssuedCard } from '../src/commerce/types.ts';
import type { Job, Quote } from '../src/types.ts';


const job: Job = {
  id: `job_ordertest_${Date.now()}`, kind: 'consumer', state: 'ORDERED', createdAt: Date.now(), updatedAt: Date.now(),
  customer: { name: 'Dorothy', phone: '+16195550100' }, appliance: 'dryer', model: 'WED4815EW',
  part: { partNumber: 'WP3392519', name: 'Dryer thermal fuse', crossRefs: ['3392519'], safety: 'diy_with_caution', safetyNote: '', techVisitCost: 200, installSteps: [] },
  quotes: [], calls: [], vendorCallCount: {}, laneAttempts: {}, guardedCalls: 0, reservedMinutes: 0, agentCostUsd: 0, safetyAcks: [], callbackAttempts: 0, notes: [],
};
const phoneQuote: Quote = {
  vendorId: 'partsdirect', supplier: 'PartsDirect Counter', price: 9.1, shipping: 3.95, landedTotal: 13.05, inStock: true,
  eta: 'Tuesday', partNumberSaid: 'WP3392519', identicalPart: true, callId: 'order_test', source: 'tool',
};

let quote: Quote = phoneQuote;
if (process.argv.includes('--online')) {
  const online = await getOnlineQuotes(job.part!);
  const ok = online.quotes.filter((q) => q.identicalPart && q.inStock && q.landedTotal <= 40);
  console.log(`online quotes: ${online.quotes.length} (${online.freshness}${online.error ? `: ${online.error}` : ''}), ${ok.length} identical + in stock + under the $40 cap`);
  for (const q of ok) console.log(`  $${q.landedTotal.toFixed(2)}  ${q.merchant}  ${q.url}`);
  const pick = ok.find((q) => q.vendorId === 'online:amazon') ?? ok[0];
  if (!pick) {
    console.error('no orderable online quote');
    process.exit(1);
  }
  quote = toQuote(pick);
  console.log(`ordering from ${pick.merchant} at $${pick.landedTotal.toFixed(2)}${pick.vendorId === 'online:amazon' ? '' : ' (no orderable Amazon listing; cheapest identical instead)'}`);
}

const key = process.env.LITHIC_API_KEY;
if (!key) {
  console.error('LITHIC_API_KEY is not set. Create a sandbox key at https://app.lithic.com (Sandbox → API keys) and add it to server/.env.');
  process.exit(2);
}

const base = lithicIssuer(key);
let card: IssuedCard | undefined;
const issuer = { ...base, name: base.name, issue: async (r: Parameters<typeof base.issue>[0]) => (card = await base.issue(r)) };

// Print events instead of appending to server/data/events.jsonl, which the live :3000 server owns.
const emit = ((jobId: string | null, type: string, data: Record<string, unknown> = {}) => {
  console.log(`[event] ${type}`, JSON.stringify(data));
  return { id: 0, ts: new Date().toISOString(), jobId, type, data };
}) as CommerceDeps['emit'];

const checks: Array<[string, boolean, string]> = [];
const result = await placeOrder({ job, quote, approvedBy: 'user_voice' }, { issuer, merchantFor: () => lithicSimulatedMerchant(key, quote), emit });
console.log('placeOrder →', result);
checks.push(['order placed at the approved total', result.status === 'placed' && result.total === quote.landedTotal, JSON.stringify(result)]);

if (card) {
  const other = await chargeSimulated(key, card, 100 as Cents, 'SOME OTHER STORE', 'otherstore');
  checks.push(['second merchant declined by the issuer (merchant lock)', other.status === 'declined', JSON.stringify(other)]);
  const over = await chargeSimulated(key, card, 1 as Cents, quote.supplier.toUpperCase().slice(0, 22), quote.vendorId);
  checks.push(['one cent over the cap declined by the issuer', over.status === 'declined', JSON.stringify(over)]);
  await base.close(card.cardId);
}

for (const [name, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
