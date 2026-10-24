import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cast, discoverVendors, nameFrom, rank } from '../src/commerce/exa-vendors.ts';
import type { RosterEntry } from '../src/types.ts';

const hit = (title: string, url: string, highlight: string) => ({ title, url, highlights: [highlight] });

test('rank keeps local parts counters, drops directories and national web stores, and merges repeats', () => {
  const coast = hit('San Diego Coast Parts | Coast Appliance Parts', 'https://www.coastparts.com/locations/SD', 'Address 4408 Twain Ave. San Diego, CA 92120 Phone (619) 584-1192');
  const vendors = rank([
    [hit('Best appliance parts - Yelp', 'https://www.yelp.com/x', 'San Diego parts'), coast, hit('Thermal fuse', 'https://www.repairclinic.com/p', 'parts')],
    [coast, hit('Appliance Parts Sales | San Diego, CA', 'https://www.brownesappliance.com/parts', "Benefits of Choosing Browne's Appliance for parts in San Diego")],
    [hit('APD Appliance & Distributor', 'https://appliancepartsbayarea.com', 'Appliance parts at 16200 E 14th St San Leandro, CA 94578')],
  ], 'San Diego, CA', 4);
  assert.deepEqual(vendors.map((v) => v.name), ['Coast Appliance Parts', "Browne's Appliance", 'APD Appliance & Distributor']);
  assert.equal(vendors[0].address, '4408 Twain Ave. San Diego, CA 92120');
  assert.equal(vendors[0].listedPhone, '(619) 584-1192');
});

test('nameFrom prefers the piece that names the business', () => {
  assert.equal(nameFrom('Appliance Parts Master – Parts', 'appliancepartsmasters.com'), 'Appliance Parts Master');
});

test('cast lends names only: the dialed number, id and sim persona stay the roster slot\'s', () => {
  const slots: RosterEntry[] = [{ id: 'valley', name: 'Valley', phone: '+18587177613', lane: 'supplier', simPersona: 'quote:55:4:in_stock:today' }];
  const [c] = cast(slots, [{ name: 'Coast Appliance Parts', url: 'https://coastparts.com', domain: 'coastparts.com', address: null, listedPhone: '(619) 584-1192', snippet: '', score: 1 }]);
  assert.deepEqual(c, { ...slots[0], name: 'Coast Appliance Parts' });
});

test('no key: falls back to the cache, never throws', async () => {
  const saved = process.env.EXA_API_KEY;
  delete process.env.EXA_API_KEY;
  try {
    const d = await discoverVendors('Whirlpool dryer');
    assert.equal(d.freshness, 'cached');
    assert.equal(d.error, 'exa disabled');
  } finally {
    if (saved) process.env.EXA_API_KEY = saved;
  }
});
