import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'fixie-admin-'));
process.env.DRY_RUN = '1';
process.env.JOBS_FILE = join(dir, 'jobs.json');
process.env.CUSTOMERS_FILE = join(dir, 'customers.json');
process.env.MESSAGES_FILE = join(dir, 'messages.json');
process.env.ROSTER_FILE = join(dir, 'roster.json');
process.env.ADMIN_LOG_FILE = join(dir, 'none.log');

const person = (id: string, name: string, phone: string, lane: string) => ({ id, name, phone, lane });
writeFileSync(
  process.env.ROSTER_FILE,
  JSON.stringify({
    user: person('dorothy', 'Dorothy', '+16195550100', 'user'),
    warranty: person('whirlpool', 'Whirlpool Parts & Warranty', '+16195550101', 'warranty'),
    suppliers: [person('valley', 'Valley Appliance Parts', '+16195550102', 'supplier'), person('coast', 'Coast Supply', '+16195550104', 'supplier')],
  }),
);
writeFileSync(
  process.env.CUSTOMERS_FILE,
  JSON.stringify({
    customers: [
      { phone: '6195557777', name: 'Priya', appliances: [{ appliance: 'Samsung washer', model: 'WF45', purchaseYear: 2021 }], jobs: [{ jobId: 'job_old', issue: 'drum noise', state: 'FIXED', at: 1000 }], notes: ['prefers texts'] },
    ],
  }),
);

const { default: express } = await import('express');
const { register } = await import('../src/admin/routes.ts');
const { register: registerVision } = await import('../src/vision/routes.ts');
const { jobs } = await import('../src/jobs.ts');
const { emit } = await import('../src/events.ts');
const { listMessages } = await import('../src/admin/messages.ts');
const { config } = await import('../src/config.ts');
type Quote = import('../src/types.ts').Quote;

const app = express();
register(app);
registerVision(app);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

const AUTH = { 'x-admin': config.adminToken };
const UI = { ...AUTH, 'x-admin-ui': '1', 'content-type': 'application/json' };
const state = async (reveal = 0) => (await fetch(`${base}/admin/api/state?reveal=${reveal}`, { headers: AUTH })).json() as Promise<any>;
const send = (payload: unknown, headers: Record<string, string> = UI) =>
  fetch(`${base}/admin/api/messages`, { method: 'POST', headers, body: JSON.stringify(payload) });

const quote = (over: Partial<Quote>): Quote => ({
  vendorId: 'valley',
  supplier: 'Valley Appliance Parts',
  price: 55,
  shipping: 4,
  landedTotal: 59,
  inStock: true,
  eta: 'today',
  identicalPart: true,
  callId: 'call_valley',
  source: 'tool',
  ...over,
});

const priya = jobs.create({ kind: 'consumer', customer: { name: 'Priya Shah', phone: '+16195557777' }, appliance: 'Samsung washer', model: 'WF45', symptom: 'will not spin' });
const dorothy = jobs.create({
  kind: 'consumer',
  customer: { name: 'Dorothy', phone: '+16195550100' },
  appliance: 'Whirlpool dryer',
  model: 'WED4815EW',
  symptom: 'no heat',
  part: { partNumber: 'WP3392519', name: 'Thermal fuse', crossRefs: [], safety: 'diy', safetyNote: '', techVisitCost: 180, installSteps: [] },
});

test('auth: x-admin token accepted, wrong or missing token rejected', async () => {
  assert.equal((await fetch(`${base}/admin/api/state`, { headers: AUTH })).status, 200);
  assert.equal((await fetch(`${base}/admin/api/state`, { headers: { 'x-admin': 'nope' } })).status, 401);
  assert.equal((await fetch(`${base}/admin/api/state`)).status, 401);
  const basic = 'Basic ' + Buffer.from(`${process.env.ADMIN_USER || 'bao'}:${process.env.ADMIN_PASS || 'bao'}`).toString('base64');
  assert.equal((await fetch(`${base}/admin/api/state`, { headers: { authorization: basic } })).status, 200);
});

test('reveal=0 masks every phone, reveal=1 shows full numbers', async () => {
  const phones: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'phone' && typeof x === 'string') phones.push(x);
        else walk(x);
      }
    }
  };
  walk(await state(0));
  assert.ok(phones.length > 8, `saw ${phones.length} phone fields`);
  assert.ok(phones.every((p) => /^···\d{4}$/.test(p)), `masked: ${phones.join(' ')}`);
  const full = await state(1);
  assert.equal(full.jobs.find((j: any) => j.id === dorothy.id).customer.phone, '+16195550100');
  assert.ok(full.directory.some((e: any) => e.phone === '+16195557777'));
});

test('customers merge customers.json profiles with job callers by last 10 digits', async () => {
  const s = await state(1);
  const c = s.customers.find((x: any) => x.key === 'cust:6195557777');
  assert.equal(c.name, 'Priya');
  assert.equal(c.phone, '+16195557777');
  assert.deepEqual(c.jobs.map((j: any) => j.jobId).sort(), ['job_old', priya.id].sort());
  assert.deepEqual(c.notes, ['prefers texts']);
  assert.equal(c.appliances.length, 1, 'profile appliance is not duplicated by the job');
  assert.ok(s.customers.some((x: any) => x.key === 'cust:6195550100'), 'a caller with no profile still appears');
});

test('directory lists fixie as not textable, plus customers and roster entries', async () => {
  const d = Object.fromEntries((await state(0)).directory.map((e: any) => [e.key, e]));
  assert.equal(d.fixie.textable, false);
  assert.equal(d['cust:6195557777'].kind, 'customer');
  assert.equal(d['roster:valley'].kind, 'vendor');
  assert.equal(d['roster:valley'].mode, 'sim');
  assert.equal(d['roster:dorothy'].kind, 'test_user');
});

test('POST /admin/api/messages records dry_run messages for customer and roster keys', async () => {
  for (const to of ['cust:6195557777', 'roster:valley']) {
    const res = await send({ to, channel: 'whatsapp', body: '  Hello there  ' });
    assert.equal(res.status, 200);
    const j: any = await res.json();
    assert.equal(j.ok, true);
    assert.equal(j.message.status, 'dry_run');
    assert.equal(j.message.body, 'Hello there');
    assert.equal(j.message.source, 'admin');
    assert.equal(j.message.party.key, to);
    assert.match(j.message.phone, /^···/);
  }
  const s = await state(1);
  const m = s.messages.find((x: any) => x.party.key === 'roster:valley');
  assert.equal(m.phone, '+16195550102');
  assert.equal(m.party.kind, 'vendor');
});

test('POST /admin/api/messages rejects raw numbers, unknown keys, fixie, bad bodies, and a missing x-admin-ui', async () => {
  const before = listMessages().length;
  for (const to of ['+16195557777', '6195557777', 'cust:0000000000', 'fixie']) {
    assert.equal((await send({ to, channel: 'sms', body: 'hi' })).status, 400, `rejects ${to}`);
  }
  assert.equal((await send({ to: 'cust:6195557777', channel: 'telegram', body: 'hi' })).status, 400);
  assert.equal((await send({ to: 'cust:6195557777', channel: 'sms', body: '   ' })).status, 400);
  assert.equal((await send({ to: 'cust:6195557777', channel: 'sms', body: 'x'.repeat(1001) })).status, 400);
  assert.equal((await send({ to: 'cust:6195557777', channel: 'sms', body: 'hi' }, AUTH)).status, 400);
  assert.equal(listMessages().length, before, 'nothing recorded for rejected sends');
});

test('messages persist to MESSAGES_FILE and survive a reload', async () => {
  const onDisk = JSON.parse(readFileSync(process.env.MESSAGES_FILE!, 'utf8')) as { messages: { phone: string; body: string }[] };
  assert.ok(onDisk.messages.some((m) => m.phone === '+16195550102' && m.body === 'Hello there'));
  const script = "const { listMessages } = await import('./src/admin/messages.ts'); console.log(JSON.stringify(listMessages().map((m) => m.body)))";
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: join(import.meta.dirname, '..'),
    env: { ...process.env },
    encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(child.stdout.trim().split('\n').at(-1)!), listMessages().map((m) => m.body));
  assert.ok(listMessages().length >= 2);
});

test('agent texts in note events are recorded as source agent against the job customer', async () => {
  emit(dorothy.id, 'note', { kind: 'whatsapp_sent', to: '···0100', text: 'I ordered your part.' });
  emit(dorothy.id, 'note', { kind: 'text_sent', to: '···0100', text: 'Unplug it first.', dryRun: true });
  emit(dorothy.id, 'note', { kind: 'whatsapp_failed', to: '···0100', code: 63016, detail: 'outside window' });
  emit(dorothy.id, 'note', { kind: 'something_else', text: 'ignored' });
  emit(null, 'note', { kind: 'whatsapp_sent', text: 'no job, ignored' });
  const agent = (await state(1)).messages.filter((m: any) => m.source === 'agent');
  const by = Object.fromEntries(agent.map((m: any) => [m.status, m]));
  assert.equal(agent.length, 3);
  assert.equal(by.sent.body, 'I ordered your part.');
  assert.equal(by.sent.phone, '+16195550100');
  assert.equal(by.sent.jobId, dorothy.id);
  assert.equal(by.sent.party.name, 'Dorothy');
  assert.equal(by.dry_run.body, 'Unplug it first.');
  assert.match(by.failed.reason, /outside window/);
});

test('inbound texts to /sms/inbound are logged as received', async () => {
  const res = await fetch(`${base}/sms/inbound`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: '+16195557777', Body: 'Thanks, it works now', NumMedia: '0' }),
  });
  assert.equal(res.status, 200);
  const m = (await state(1)).messages.find((x: any) => x.source === 'inbound');
  assert.equal(m.direction, 'in');
  assert.equal(m.status, 'received');
  assert.equal(m.channel, 'sms');
  assert.equal(m.party.name, 'Priya');
});

test('an ORDERED job with a best deal appears in orders with its totals', async () => {
  const deal = quote({});
  jobs.update(dorothy.id, (j) => {
    j.quotes.push(deal);
    j.bestDeal = deal;
  });
  jobs.transition(dorothy.id, 'NEW', 'ORDERED');
  emit(dorothy.id, 'order_confirmed', { supplier: deal.supplier, price: 59, landedTotal: 59, approvedBy: 'user_voice', mockOrder: true, callId: deal.callId });
  const orders = (await state(0)).orders;
  assert.equal(orders.length, 1);
  const o = orders[0];
  assert.equal(o.jobId, dorothy.id);
  assert.equal(o.customer.key, 'cust:6195550100');
  assert.equal(o.supplier, 'Valley Appliance Parts');
  assert.deepEqual([o.price, o.shipping, o.landedTotal], [55, 4, 59]);
  assert.equal(o.approvedBy, 'user_voice');
  assert.deepEqual(o.part, { partNumber: 'WP3392519', name: 'Thermal fuse' });
  assert.deepEqual(o.payment, { kind: 'mock', status: 'confirmed', orderId: null, last4: null, reason: null });

  emit(dorothy.id, 'order_placed', { orderId: 'ord_1', merchant: 'Valley', total: 59, last4: '4242', status: 'placed' });
  const placed = (await state(0)).orders[0].payment;
  assert.deepEqual([placed.kind, placed.status, placed.orderId, placed.last4], ['card', 'placed', 'ord_1', '4242']);
});

test('responses: a supplier call with no quote is no_quote, a quoted one is quoted and chosen', async () => {
  jobs.update(dorothy.id, (j) => {
    j.calls.push({ callId: 'call_valley', lane: 'supplier', vendorId: 'valley', to: '+16195550102', startedAt: 5000, endedAt: 9000, endedReason: 'customer-ended-call', durationSec: 40 });
    j.calls.push({ callId: 'call_coast', lane: 'supplier', vendorId: 'coast', to: '+16195550104', startedAt: 6000, endedAt: 7000, endedReason: 'voicemail', durationSec: 12 });
    j.calls.push({ callId: 'call_live', lane: 'supplier', vendorId: 'valley', to: '+16195550102', startedAt: 8000 });
    j.calls.push({ callId: 'call_user', lane: 'user', to: '+16195550100', startedAt: 1 });
  });
  for (let i = 0; i < 12; i++) emit(dorothy.id, 'transcript', { callId: 'call_valley', speaker: 'supplier', text: `line ${i}` });
  const rs: any[] = (await state(0)).responses;
  const byId = Object.fromEntries(rs.map((r) => [r.id, r]));
  assert.equal(byId.call_user, undefined, 'only supplier and warranty calls');
  assert.equal(byId.call_valley.outcome, 'quoted');
  assert.equal(byId.call_valley.chosen, true);
  assert.equal(byId.call_valley.quote.landedTotal, 59);
  assert.equal(byId.call_valley.durationSec, 40);
  assert.equal(byId.call_valley.transcript.length, 12, 'full transcript, not the last 8 lines');
  assert.equal(byId.call_valley.supplier, 'Valley Appliance Parts');
  assert.equal(byId.call_coast.outcome, 'no_quote');
  assert.equal(byId.call_coast.endedReason, 'voicemail');
  assert.equal(byId.call_coast.chosen, false);
  assert.equal(byId.call_coast.quote, null);
  assert.equal(byId.call_live.outcome, 'in_progress');
  assert.deepEqual(rs.map((r) => r.at), [...rs.map((r) => r.at)].sort((a, b) => b - a), 'newest first');
});

test('responses: an online quote is a channel online response, rejected when a guard flagged it', async () => {
  jobs.update(priya.id, (j) => {
    j.quotes.push(quote({ vendorId: 'repairclinic', supplier: 'RepairClinic', callId: '', source: 'online', url: 'https://example.test/p', landedTotal: 80 }));
    j.quotes.push(quote({ vendorId: 'pricey', supplier: 'Pricey Parts', callId: '', source: 'online', landedTotal: 400, rejectedReason: 'over budget' }));
  });
  const rs: any[] = (await state(0)).responses;
  const ok = rs.find((r) => r.id === `online:${priya.id}:repairclinic`);
  assert.deepEqual([ok.channel, ok.outcome, ok.chosen, ok.quote.url], ['online', 'quoted', false, 'https://example.test/p']);
  assert.equal(rs.find((r) => r.id === `online:${priya.id}:pricey`).outcome, 'rejected');
});
