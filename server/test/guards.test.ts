import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guards } from '../src/guards.ts';
import { parts } from '../src/parts.ts';
import { config, loadRoster } from '../src/config.ts';
import type { Job, Quote } from '../src/types.ts';

const roster = loadRoster();
let n = 0;
function makeJob(over: Partial<Job> = {}): Job {
  const now = Date.now();
  return {
    id: `test_${++n}`,
    kind: 'consumer',
    state: 'SOURCING',
    createdAt: now,
    updatedAt: now,
    customer: { name: 'Dorothy', phone: roster.user.phone },
    quotes: [],
    calls: [],
    vendorCallCount: {},
    laneAttempts: {},
    guardedCalls: 0,
    reservedMinutes: 0,
    agentCostUsd: 0,
    safetyAcks: [],
    callbackAttempts: 0,
    notes: [],
    ...over,
  };
}
const dryer = () => parts.lookup('WED4815EW', 'no heat')!.part;

test('reserve blocks the 9th guarded call', () => {
  const job = makeJob();
  const targets = [roster.warranty, ...roster.suppliers];
  const results = [];
  for (let i = 0; i < 9; i++) {
    const v = targets[i % targets.length];
    // Reset per-vendor counts so the loop guard is not what trips.
    job.vendorCallCount = {};
    results.push(guards.reserve(job, { lane: v.lane, vendorId: v.id, maxSec: 45, to: v.phone }));
  }
  assert.equal(results.slice(0, 8).every((r) => r.ok), true);
  assert.equal(results[8].ok, false);
  assert.equal(results[8].kind, 'max_calls');
  assert.equal(job.guardedCalls, config.caps.maxCalls);
});

test('three concurrent reserves for the same vendor block the 3rd (loop)', async () => {
  const job = makeJob();
  const v = roster.suppliers[0];
  const verdicts = await Promise.all(
    [1, 2, 3].map(async () => guards.reserve(job, { lane: 'supplier', vendorId: v.id, maxSec: 45, to: v.phone })),
  );
  assert.deepEqual(verdicts.map((r) => r.ok), [true, true, false]);
  assert.equal(verdicts[2].kind, 'loop');
  assert.equal(job.vendorCallCount[v.id], 2);
});

test("an exempt lane's 3rd attempt is blocked and does not count toward max_calls", () => {
  const job = makeJob();
  const r = [1, 2, 3].map(() => guards.reserve(job, { lane: 'user', maxSec: 90, to: job.customer.phone }));
  assert.deepEqual(r.map((x) => x.ok), [true, true, false]);
  assert.equal(r[2].kind, 'max_calls');
  assert.equal(job.guardedCalls, 0);
});

test('vendor_not_approved blocks unknown numbers', () => {
  const job = makeJob();
  const r = guards.reserve(job, { lane: 'supplier', vendorId: 'x', maxSec: 45, to: '+15555550199' });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'vendor_not_approved');
  assert.equal(job.guardedCalls, 0);
});

test('minutes are reserved and trued up on settle', () => {
  const job = makeJob();
  const v = roster.suppliers[1];
  assert.ok(guards.reserve(job, { lane: 'supplier', vendorId: v.id, maxSec: 60, to: v.phone }).ok);
  assert.equal(job.reservedMinutes, 1);
  guards.settle(
    job,
    { callId: 'c1', jobId: job.id, lane: 'supplier', vendorId: v.id, to: v.phone, maxSec: 60, mode: 'sim', epoch: 1, state: 'ended', createdAt: 0, quoted: true, attempt: 1 },
    30,
    0.25,
  );
  assert.equal(job.reservedMinutes, 0.5);
  assert.equal(job.agentCostUsd, 0.25);
});

test('checkQuote rejects a $59 landed total at a $40 cap', () => {
  const job = makeJob({ part: dryer() });
  const q: Quote = {
    vendorId: 'valley', supplier: 'Valley Appliance Parts', price: 55, shipping: 4, landedTotal: 59,
    inStock: true, eta: 'today', partNumberSaid: 'WP3392519', identicalPart: true, callId: 'c', source: 'tool',
  };
  const v = guards.checkQuote(job, q);
  assert.ok(v && !v.ok);
  assert.equal(v.kind, 'budget');
  assert.match(v.detail!, /\$59\.00/);
  assert.match(v.detail!, /\$40/);
  assert.equal(guards.checkQuote(job, { ...q, price: 9.1, shipping: 3.95, landedTotal: 13.05 }), null);
});

test('canAdvanceInstall: every step after 1 needs unplugged; the plug-in step also needs vent_cleared', () => {
  const part = dryer();
  const last = part.installSteps.length;
  const job = makeJob({ part });
  assert.equal(guards.canAdvanceInstall(job, 1), null);
  for (const step of [2, 4, last - 1, last]) {
    const blocked = guards.canAdvanceInstall(job, step);
    assert.ok(blocked && !blocked.ok, `step ${step} blocked without ack`);
    assert.equal(blocked.kind, 'safety');
    assert.match(blocked.detail!, /unplugged/);
  }
  job.safetyAcks.push('unplugged');
  assert.equal(guards.canAdvanceInstall(job, 2), null);
  assert.equal(guards.canAdvanceInstall(job, last - 1), null);
  const gated = guards.canAdvanceInstall(job, last);
  assert.ok(gated && !gated.ok);
  assert.match(gated.detail!, /vent/);
  assert.doesNotMatch(gated.detail!, /unplugged/);
  job.safetyAcks.push('vent_cleared');
  assert.equal(guards.canAdvanceInstall(job, last), null);
});

test('reserve on a terminal job is a manual stop, not max_calls', () => {
  const job = makeJob({ state: 'FIXED' });
  const v = roster.suppliers[0];
  const r = guards.reserve(job, { lane: 'supplier', vendorId: v.id, maxSec: 45, to: v.phone });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'manual');
  assert.equal(r.action, 'stopped');
  assert.equal(r.detail, 'job is FIXED; no further calls');
  assert.equal(job.guardedCalls, 0);
});

test('safetyKeywords escalates smoke / gas', () => {
  assert.equal(guards.safetyKeywords('it smells like burning')?.action, 'escalated');
  assert.equal(guards.safetyKeywords('I smell gas')?.kind, 'safety');
  assert.equal(guards.safetyKeywords('no heat'), null);
});

test('checkSpend trips over the agent spend cap', () => {
  assert.equal(guards.checkSpend(makeJob({ agentCostUsd: 1 })), null);
  assert.equal(guards.checkSpend(makeJob({ agentCostUsd: config.spendCap + 0.01 }))?.action, 'stopped');
});
