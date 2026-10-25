// Live online price check for the demo part. Usage: npm run quotes:online [-- --write-cache]
// --write-cache stores the verified live listings in data/online-prices.json, the fallback when a live lookup fails.
import '../src/env.ts';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../src/config.ts';
import { liveOnlineQuotes } from '../src/commerce/online-quotes.ts';
import type { PartInfo } from '../src/types.ts';

const pn = process.argv.find((a) => /^[A-Z0-9-]{5,}$/.test(a)) ?? 'WP3392519';
const catalog = JSON.parse(readFileSync(join(DATA_DIR, 'parts.json'), 'utf8'));
const part: PartInfo = catalog.parts[pn];
if (!part) throw new Error(`unknown part ${pn}`);

const t0 = Date.now();
const quotes = await liveOnlineQuotes(part, 120_000);
console.log(`${quotes.length} verified listings in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const q of quotes) {
  console.log(`${q.identicalPart ? 'IDENTICAL' : 'not-ident'}  $${q.landedTotal.toFixed(2).padStart(6)} (= ${q.price} + ${q.shipping} ship/${q.shippingSource})  ${q.inStock ? 'in stock ' : 'OUT      '} ${q.merchant.padEnd(18)} ${q.partNumberSaid} ${q.genuine ? 'OEM' : 'aftermarket'}  ${q.url}`);
}
if (process.argv.includes('--write-cache')) {
  const file = join(DATA_DIR, 'online-prices.json');
  const cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  cache[pn] = {
    fetchedAt: new Date().toISOString(),
    note: 'Merged across runs of npm run quotes:online -- --write-cache from a live Claude web_search lookup; every URL host appeared in the search results.',
    offers: [...(cache[pn]?.offers ?? []).filter((o: { url: string }) => !quotes.some((q) => q.url === o.url)), ...quotes.map((q) => ({ merchant: q.merchant, url: q.url, price: q.price, shipping: q.shipping, shippingSource: q.shippingSource === 'estimated' ? 'unknown' : q.shippingSource, inStock: q.inStock, partNumberShown: q.partNumberSaid, genuine: q.genuine, eta: q.eta }))],
  };
  writeFileSync(file, JSON.stringify(cache, null, 2) + '\n');
  console.log(`wrote ${file}`);
}
