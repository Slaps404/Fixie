// Live Exa vendor discovery. `npx tsx scripts/vendors.ts [appliance] [--write-cache]`
import '../src/env.ts';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../src/config.ts';
import { discoverVendors } from '../src/commerce/exa-vendors.ts';

const args = process.argv.slice(2);
const appliance = args.find((a) => !a.startsWith('--')) ?? 'Whirlpool dryer';
const d = await discoverVendors(appliance, { timeoutMs: 4000 });
console.log(`${d.freshness} in ${d.ms}ms${d.error ? ` (${d.error})` : ''}`);
for (const v of d.vendors) console.log(`  ${v.score.toFixed(1).padStart(4)}  ${v.name}  | ${v.address ?? '-'} | ${v.listedPhone ?? '-'} | ${v.domain}`);
if (args.includes('--write-cache') && d.freshness === 'live') {
  writeFileSync(join(DATA_DIR, 'vendors-cache.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), appliance, vendors: d.vendors }, null, 2) + '\n');
  console.log('wrote data/vendors-cache.json');
}
