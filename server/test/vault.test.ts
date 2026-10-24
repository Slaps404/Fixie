import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVault } from '../src/commerce/vault.ts';
import { armOrderCard, handleOrderResult, handleReadCard, ORDER_CALL_OVERRIDES, redactPan, type ReadCardDeps } from '../src/commerce/order-call.ts';
import type { Job } from '../src/types.ts';

const PAN = '4242424242424242';
process.env.CARD_ENC_KEY = randomBytes(32).toString('base64');
const file = () => join(mkdtempSync(join(tmpdir(), 'vault-')), 'vault.json');
const card = { pan: '4242 4242 4242 4242', expMonth: '12', expYear: '30', cvc: '123' };

test('vault: encrypted at rest, round-trips, returns only token + last4', () => {
  const f = file();
  const v = createVault(f);
  const r = v.put(card);
  assert.match(r.token, /^card_[0-9a-f]{24}$/);
  assert.equal(r.last4, '4242');
  const disk = readFileSync(f, 'utf8');
  assert.ok(!disk.includes(PAN) && !disk.includes('"123"'), 'no PAN or CVC on disk');
  assert.equal(v.revealForCall(r.token).use((c) => c.pan), PAN);
  assert.equal(JSON.stringify(v.revealForCall(r.token)), '"[card redacted]"');
});

test('vault: refuses non-test cards unless ALLOW_REAL_CARDS=1, and invalid numbers always', () => {
  const v = createVault(file());
  assert.throws(() => v.put({ ...card, pan: '4111111111111111' }), /only the Stripe test card/);
  process.env.ALLOW_REAL_CARDS = '1';
  try {
    assert.equal(v.put({ ...card, pan: '4111111111111111' }).last4, '1111');
  } finally {
    delete process.env.ALLOW_REAL_CARDS;
  }
  assert.throws(() => v.put({ ...card, pan: '4242424242424241' }), /valid card/);
  assert.throws(() => v.put({ ...card, expYear: '20' }), /expired/);
});

test('vault: tampered ciphertext or a different key cannot decrypt', () => {
  const f = file();
  const v = createVault(f);
  const { token } = v.put(card);
  const all = JSON.parse(readFileSync(f, 'utf8'));
  const ct = Buffer.from(all[token].ct, 'base64');
  ct[0] ^= 1;
  writeFileSync(f, JSON.stringify({ ...all, [token]: { ...all[token], ct: ct.toString('base64') } }));
  assert.throws(() => v.revealForCall(token));
  const good = createVault(file());
  const t2 = good.put(card).token;
  const key = process.env.CARD_ENC_KEY;
  process.env.CARD_ENC_KEY = randomBytes(32).toString('base64');
  try {
    assert.throws(() => good.revealForCall(t2));
  } finally {
    process.env.CARD_ENC_KEY = key;
  }
});

function setup() {
  const v = createVault(file());
  const { token } = v.put(card);
  const job = {
    id: 'job_o1', state: 'ORDERED', part: { partNumber: 'WP3392519', name: 'fuse' },
    bestDeal: { vendorId: 'partsdirect', supplier: 'PartsDirect Counter', landedTotal: 13.05 },
  } as unknown as Job;
  armOrderCard(job.id, token);
  const released: unknown[] = [];
  const deps: ReadCardDeps = { vault: v, rosterPhone: (id) => (id === 'partsdirect' ? '+16195550103' : '+16195550102'), onRelease: (e) => released.push(e) };
  const ctx = { callId: 'c1', lane: 'supplier' as const, vendorId: 'partsdirect', to: '+16195550103' };
  return { job, deps, ctx, released };
}

test('read_card: releases the number in groups of four only after the vendor states a total at or under approval', () => {
  const { job, deps, ctx, released } = setup();
  assert.match(handleReadCard(job, ctx, { part: 'number' }, deps), /^Do not read/, 'no total yet');
  assert.match(handleReadCard(job, ctx, { part: 'number', totalQuoted: 18 }, deps), /^Do not read.*over the approved \$13\.05/);
  assert.match(handleReadCard(job, ctx, { part: 'cvc', totalQuoted: 13.05 }, deps), /^Do not read.*number first/);
  const r = handleReadCard(job, ctx, { part: 'number', totalQuoted: 13.05 }, deps);
  assert.match(r, /4 2 4 2, 4 2 4 2, 4 2 4 2, 4 2 4 2/);
  assert.match(handleReadCard(job, ctx, { part: 'expiry', totalQuoted: 13.05 }, deps), /12 slash 30/);
  assert.match(handleReadCard(job, ctx, { part: 'cvc', totalQuoted: 13.05 }, deps), /1 2 3/);
  assert.ok(!JSON.stringify(released).includes(PAN) && !JSON.stringify(released).includes('123'), 'audit events carry last4 only');
  assert.deepEqual((released as Array<{ part: string; last4: string }>).map((e) => [e.part, e.last4]), [['number', '4242'], ['expiry', '4242'], ['cvc', '4242']]);
});

test('read_card: never on another vendor, another number, or an unapproved job', () => {
  const { job, deps, ctx } = setup();
  assert.match(handleReadCard(job, { ...ctx, vendorId: 'valley', to: '+16195550102' }, { part: 'number', totalQuoted: 13.05 }, deps), /not the approved vendor/);
  assert.match(handleReadCard(job, { ...ctx, to: '+16195559999' }, { part: 'number', totalQuoted: 13.05 }, deps), /approved vendor's number/);
  assert.match(handleReadCard(job, { ...ctx, lane: 'delivery' }, { part: 'number', totalQuoted: 13.05 }, deps), /not the approved vendor/);
  assert.match(handleReadCard({ ...job, state: 'AWAITING_CONFIRMATION' } as Job, ctx, { part: 'number', totalQuoted: 13.05 }, deps), /no approved order/);
});

test('record_order_result disarms the card: no more reads after the order is recorded', () => {
  const { job, deps, ctx } = setup();
  handleReadCard(job, ctx, { part: 'number', totalQuoted: 13.05 }, deps);
  const { event } = handleOrderResult(job, ctx, { placed: true, orderNumber: 'PD-1042', total: 13.05 }, '4242');
  assert.equal(event.orderId, 'PD-1042');
  assert.equal(event.last4, '4242');
  assert.match(handleReadCard(job, ctx, { part: 'number', totalQuoted: 13.05 }, deps), /no approved order/);
});

test('redactPan strips digit runs, spoken digit words, and security codes', () => {
  assert.equal(redactPan('Sure, it is 4242 4242 4242 4242, expiry 12/30.'), 'Sure, it is [card ···4242] expiry 12/30.');
  assert.equal(redactPan('4 2 4 2, 4 2 4 2, 4 2 4 2, 4 2 4 2'), '[card ···4242]');
  assert.match(redactPan('four two four two four two four two four two four two four two four two'), /^\[card number\]/);
  assert.equal(redactPan('the security code is 123'), 'the security code is [redacted]');
  assert.equal(redactPan('That will be $13.05 with shipping, part WP3392519.'), 'That will be $13.05 with shipping, part WP3392519.');
});

test('order call disables recording, logging, and transcripts, and enables Vapi PCI mode', () => {
  assert.deepEqual(ORDER_CALL_OVERRIDES, {
    artifactPlan: { recordingEnabled: false, loggingEnabled: false, transcriptPlan: { enabled: false } },
    compliancePlan: { pciEnabled: true },
  });
});
