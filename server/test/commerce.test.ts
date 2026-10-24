import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { placeOrder, resetOrders, revokeCards, type CommerceDeps } from '../src/commerce/place-order.ts';
import { CardSecret, type Cents, type IssuedCard, type Issuer, type Merchant } from '../src/commerce/types.ts';
import type { Job, Quote } from '../src/types.ts';

const PAN = '4111110000001305';

function job(): Job {
  return {
    id: 'job_t1', kind: 'consumer', state: 'ORDERED', createdAt: 0, updatedAt: 0,
    customer: { name: 'Dorothy', phone: '+16195550100' },
    part: { partNumber: 'WP3392519', name: 'Dryer thermal fuse', crossRefs: [], safety: 'diy_with_caution', safetyNote: '', techVisitCost: 200, installSteps: [] },
    quotes: [], calls: [], vendorCallCount: {}, laneAttempts: {}, guardedCalls: 0, reservedMinutes: 0, agentCostUsd: 0, safetyAcks: [], callbackAttempts: 0, notes: [],
  };
}
const quote = (over: Partial<Quote> = {}): Quote => ({
  vendorId: 'partsdirect', supplier: 'PartsDirect Counter', price: 9.1, shipping: 3.95, landedTotal: 13.05, inStock: true, eta: 'Tuesday',
  identicalPart: true, callId: 'call_1', source: 'tool', ...over,
});

/** Issuer double that enforces the cap and the lock the way a real issuer's authorization engine does. */
function harness(merchantCharge?: (limit: Cents) => Cents) {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  const cards: Array<IssuedCard & { closed: boolean; lockedTo?: string; spent: number }> = [];
  const issuer: Issuer = {
    name: 'test-issuer',
    async issue({ limitCents }) {
      const c = { issuer: 'test-issuer', cardId: `card_${cards.length + 1}`, last4: PAN.slice(-4), limitCents, lock: 'merchant_locked' as const, secret: new CardSecret(PAN, '123', '12', '2030'), closed: false, spent: 0 };
      cards.push(c);
      return c;
    },
    async close(cardId) {
      const c = cards.find((x) => x.cardId === cardId);
      if (c) c.closed = true;
    },
  };
  const authorize = (card: IssuedCard, merchantId: string, amount: Cents) => {
    const c = cards.find((x) => x.cardId === card.cardId)!;
    if (c.closed) return 'card closed';
    if (c.lockedTo && c.lockedTo !== merchantId) return 'merchant lock';
    if (c.spent + amount > c.limitCents) return 'over limit';
    c.lockedTo = merchantId;
    c.spent += amount;
    return null;
  };
  const merchant: Merchant = {
    id: 'm_partsdirect', name: 'PartsDirect (test)', sandbox: true,
    async checkout({ card, totalCents }) {
      const amount = merchantCharge ? merchantCharge(totalCents) : totalCents;
      const err = card.secret.use(({ pan }) => (pan === PAN ? authorize(card, 'm_partsdirect', amount) : 'bad pan'));
      return err ? { status: 'declined', reason: err } : { status: 'placed', orderId: 'ord_1', chargedCents: amount };
    },
  };
  const deps: CommerceDeps = {
    issuer,
    merchantFor: () => merchant,
    emit: ((jobId: string | null, type: string, data: Record<string, unknown> = {}) => {
      events.push({ type, data });
      return { id: events.length, ts: '', jobId, type, data };
    }) as CommerceDeps['emit'],
  };
  return { deps, events, cards, authorize };
}

test('placeOrder: caps the card at the landed total, places the order, emits last4 only', async () => {
  resetOrders();
  const h = harness();
  const r = await placeOrder({ job: job(), quote: quote(), approvedBy: 'user_voice' }, h.deps);
  assert.deepEqual(r, { orderId: 'ord_1', merchant: 'PartsDirect (test)', total: 13.05, last4: '1305', status: 'placed' });
  assert.equal(h.cards[0].limitCents, 1305);
  assert.deepEqual(h.events.map((e) => e.type), ['vcc_issued', 'order_placed']);
  assert.equal(h.events[0].data.limit, 13.05);
  const wire = JSON.stringify(h.events) + JSON.stringify(r) + inspect(h.cards, { depth: 5 });
  assert.ok(!wire.includes(PAN), 'full card number never appears in events, results, or inspected objects');
  assert.ok(!wire.includes('"123"'), 'cvv never appears');
});

test('placeOrder: a merchant charging more than the approved total is declined by the issuer, and the card is closed', async () => {
  resetOrders();
  const h = harness((limit) => (limit + 500) as Cents);
  const r = await placeOrder({ job: job(), quote: quote(), approvedBy: 'user_voice' }, h.deps);
  assert.equal(r.status, 'declined');
  assert.equal(r.reason, 'over limit');
  assert.ok(h.cards[0].closed);
  assert.ok(!h.events.some((e) => e.type === 'order_placed'));
  assert.equal(h.authorize(h.cards[0], 'm_partsdirect', 1 as Cents), 'card closed', 'a closed card cannot be charged again');
});

test('placeOrder: the card is locked to the first merchant', async () => {
  resetOrders();
  const h = harness();
  await placeOrder({ job: job(), quote: quote(), approvedBy: 'user_voice' }, h.deps);
  assert.equal(h.authorize(h.cards[0], 'm_other', 1 as Cents), 'merchant lock');
});

test('revokeCards: the kill switch closes the job\'s card, so the issuer declines any later charge', async () => {
  resetOrders();
  const h = harness();
  await placeOrder({ job: job(), quote: quote(), approvedBy: 'user_voice' }, h.deps);
  assert.deepEqual(await revokeCards('job_t1'), ['1305']);
  assert.equal(h.authorize(h.cards[0], 'm_partsdirect', 1 as Cents), 'card closed');
});

test('placeOrder: idempotent per job+quote, so a retried tool call never buys twice', async () => {
  resetOrders();
  const h = harness();
  const [a, b] = await Promise.all([
    placeOrder({ job: job(), quote: quote(), approvedBy: 'user_voice' }, h.deps),
    placeOrder({ job: job(), quote: quote(), approvedBy: 'user_voice' }, h.deps),
  ]);
  assert.deepEqual(a, b);
  assert.equal(h.cards.length, 1);
});

test('placeOrder: refuses rejected, non-identical, or unapproved quotes before issuing a card', async () => {
  resetOrders();
  const h = harness();
  await assert.rejects(placeOrder({ job: job(), quote: quote({ rejectedReason: 'over budget' }), approvedBy: 'user_voice' }, h.deps));
  await assert.rejects(placeOrder({ job: job(), quote: quote({ identicalPart: false }), approvedBy: 'user_voice' }, h.deps));
  await assert.rejects(placeOrder({ job: job(), quote: quote(), approvedBy: 'code' as never }, h.deps));
  assert.equal(h.cards.length, 0);
});

test('CardSecret never serializes the PAN', () => {
  const s = new CardSecret(PAN, '123', '12', '2030');
  assert.equal(JSON.stringify({ s }), '{"s":"[card redacted]"}');
  assert.equal(`${s}`, '[card redacted]');
  assert.ok(!inspect(s).includes(PAN));
});
