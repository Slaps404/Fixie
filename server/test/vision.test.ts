// Visual inspection pipeline: ranking order, early-stop policy, session code lifecycle, MMS matching, routes.
// Never calls the real API: the stub vision model is forced and events go to an in-memory sink.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

process.env.JOBS_FILE = join(mkdtempSync(join(tmpdir(), 'fixie-vision-')), 'jobs.json');
process.env.VISION_STUB = '1';
process.env.VISION_DEBOUNCE_MS = '5';
process.env.DRY_RUN = '1';

const { default: express } = await import('express');
const { bumpEpoch, config } = await import('../src/config.ts');
const { jobs } = await import('../src/jobs.ts');
const policy = await import('../src/vision/policy.ts');
const { createStore, store, SESSION_TTL_MS } = await import('../src/vision/store.ts');
const { setVisionModel, stubModel } = await import('../src/vision/llm.ts');
const { setVisionSink } = await import('../src/vision/emit.ts');
const { run, ingest, spokenSummary, visualStatus } = await import('../src/vision/pipeline.ts');
const { validate, cleanModel, mergeFacts } = await import('../src/vision/validate.ts');
const { register, handleInboundMms, decodeImage } = await import('../src/vision/routes.ts');
const { startVisualSession } = await import('../src/vision/api.ts');
const { isTwilioMediaUrl, twilioSignature, validTwilioSignature } = await import('../src/vision/twilio.ts');
type VisionImage = import('../src/vision/types.ts').VisionImage;

const events: Array<{ type: string; data: Record<string, any>; simulated: boolean; jobId: string | null }> = [];
setVisionSink((jobId, type, data, simulated) => void events.push({ jobId, type, data, simulated }));
setVisionModel(stubModel);

// Tiny valid JPEG header bytes are enough: the stub never decodes pixels.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from('synthetic-test-image-bytes-0123456789')]);
const img = (id: string, kind: VisionImage['kind'], legibility: number, extra: Partial<VisionImage> = {}): VisionImage => ({
  id, source: 'camera', mime: 'image/jpeg', data: JPEG, receivedAt: 1000, kind, legibility, ...extra,
});

beforeEach(() => {
  events.length = 0;
  store.reset();
});

// ---------------------------------------------------------------- tier 2 ranking

test('ranking: nameplate > receipt > part label > appliance > other when all are legible', () => {
  const imgs = [img('o', 'other', 0.9), img('a', 'appliance', 0.9), img('p', 'part_label', 0.9), img('r', 'receipt', 0.9), img('n', 'nameplate', 0.9)];
  const order = policy.rankImages(imgs, ['model', 'purchaseDate', 'partNumber'], {}).map((r) => r.imageId);
  assert.deepEqual(order, ['n', 'r', 'p', 'a', 'o']);
});

test('ranking: a crisp receipt beats a blurry nameplate', () => {
  const order = policy.rankImages([img('n', 'nameplate', 0.1), img('r', 'receipt', 0.9)], ['model', 'purchaseDate'], {});
  assert.equal(order[0].imageId, 'r');
});

test('ranking: kinds whose goal is already confident drop down', () => {
  const facts = { model: { value: 'WED4815EW', confidence: 0.95, imageId: 'x' } };
  const order = policy.rankImages([img('n', 'nameplate', 0.9), img('r', 'receipt', 0.6)], ['model', 'purchaseDate'], facts);
  assert.deepEqual(order.map((r) => r.imageId), ['r', 'n']);
  assert.match(policy.rankReason(order, ['model', 'purchaseDate'], facts), /^receipt first \(purchase date/);
});

test('ranking: tier-1 score breaks ties between equal kinds', () => {
  const a = img('a', 'nameplate', 0.8, { tier1: { score: 0.4 } });
  const b = img('b', 'nameplate', 0.8, { tier1: { score: 0.9 } });
  assert.equal(policy.rankImages([a, b], ['model'], {})[0].imageId, 'b');
});

// ---------------------------------------------------------------- early stop

test('early stop: stops once every goal is confident and reports skipped images', () => {
  const imgs = [img('n', 'nameplate', 0.9, { extracted: true }), img('r', 'receipt', 0.9, { extracted: true }), img('n2', 'nameplate', 0.8), img('a', 'appliance', 0.9)];
  const facts = { model: { value: 'WED4815EW', confidence: 0.92, imageId: 'n' }, purchaseDate: { value: '2019-06-14', confidence: 0.9, imageId: 'r' } };
  const step = policy.nextStep(policy.rankImages(imgs, ['model', 'purchaseDate'], facts), imgs, ['model', 'purchaseDate'], facts, 2);
  assert.equal(step.action, 'stop');
  assert.equal(step.action === 'stop' && step.code, 'goals_met');
  assert.match(step.reason, /Skipped 2 image/);
});

test('early stop: picks the best pending image for an open goal; skips illegible and useless ones', () => {
  const imgs = [img('blur', 'nameplate', 0.1), img('other', 'other', 1), img('r', 'receipt', 0.7)];
  const step = policy.nextStep(policy.rankImages(imgs, ['model', 'purchaseDate'], {}), imgs, ['model', 'purchaseDate'], {}, 0);
  assert.deepEqual(step.action === 'extract' && step.imageId, 'r');
});

test('early stop: appliance shots are only a fallback when no nameplate is left', () => {
  const imgs = [img('a', 'appliance', 1), img('n', 'nameplate', 0.5)];
  const ranked = policy.rankImages(imgs, ['model'], {});
  assert.equal((policy.nextStep(ranked, imgs, ['model'], {}, 0) as any).imageId, 'n');
  imgs[1].extracted = true;
  assert.equal((policy.nextStep(ranked, imgs, ['model'], {}, 1) as any).imageId, 'a');
});

test('early stop: budget cap and per-kind failure cap', () => {
  const imgs = [img('n1', 'nameplate', 0.9), img('n2', 'nameplate', 0.9)];
  const ranked = policy.rankImages(imgs, ['model'], {});
  const b = policy.nextStep(ranked, imgs, ['model'], {}, policy.TIER3_BUDGET);
  assert.equal(b.action === 'stop' && b.code, 'budget');
  const f = policy.nextStep(ranked, imgs, ['model'], {}, 0, { nameplate: policy.MAX_FAILS_PER_KIND });
  assert.equal(f.action === 'stop' && f.code, 'nothing_useful');
});

test('pipeline: 5 captures, 2 expensive calls, then early stop (stub model)', async () => {
  const s = store.create({ jobId: null, ask: 'nameplate', goals: ['model', 'purchaseDate'] });
  for (const caption of ['dryer front', 'model sticker', 'blurry sticker', 'receipt from the store', 'model sticker again']) {
    ingest(s, { source: 'upload', mime: 'image/jpeg', data: JPEG, caption, tier1: { score: 0.7, text: 0.6 } });
  }
  await run(s);
  const types = events.map((e) => e.type);
  assert.equal(types.filter((t) => t === 'vision_capture').length, 5);
  const rank = events.find((e) => e.type === 'vision_rank')!;
  assert.equal(rank.data.by, 'stub');
  assert.equal(rank.data.order[0].kind, 'nameplate');
  const ex = events.filter((e) => e.type === 'vision_extract');
  assert.deepEqual(ex.map((e) => e.data.kind), ['nameplate', 'receipt']);
  assert.equal(ex[0].data.fields.model, 'WED4815EW');
  assert.ok(ex[0].data.confidence >= policy.CONFIDENT);
  assert.ok(ex.every((e) => e.simulated), 'stub results are flagged simulated');
  const done = events.find((e) => e.type === 'vision_done')!;
  assert.equal(done.data.stop, 'goals_met');
  assert.equal(s.tier3Calls, 2);
  assert.equal(s.status, 'done');
  assert.equal(s.facts.purchaseYear, 2019);
  assert.match(spokenSummary(s), /I can see it: Whirlpool model WED4815EW, and the receipt says June 2019 at Home Depot\./);
});

test('pipeline: a single image takes the fast path (no tier-2 call)', async () => {
  const s = store.create({ jobId: null, ask: 'nameplate', goals: ['model'] });
  ingest(s, { source: 'camera', mime: 'image/jpeg', data: JPEG, tier1: { score: 0.8, text: 0.7 } });
  await run(s);
  assert.equal(s.tier2Calls, 0);
  assert.equal(events.find((e) => e.type === 'vision_rank')!.data.by, 'fast_path');
  assert.equal(s.status, 'done');
});

test('pipeline: after the model is solved, the next single shot goes through tier 2 with the receipt prior', async () => {
  const s = store.create({ jobId: null, ask: 'nameplate', goals: ['model', 'purchaseDate'] });
  ingest(s, { source: 'camera', mime: 'image/jpeg', data: JPEG, tier1: { score: 0.8, text: 0.7 } });
  await run(s);
  assert.equal(s.facts.model?.value, 'WED4815EW');
  ingest(s, { source: 'camera', mime: 'image/jpeg', data: JPEG, tier1: { score: 0.8, text: 0.7 } });
  await run(s);
  const ranks = events.filter((e) => e.type === 'vision_rank');
  assert.deepEqual(ranks.map((e) => e.data.by), ['fast_path', 'stub']);
  assert.equal(ranks[1].data.order[0].kind, 'receipt');
  assert.equal(s.tier2Calls, 1);
  assert.equal(s.status, 'done');
  assert.equal(s.facts.purchaseDate?.value, '2019-06-14');
});

test('pipeline: a model that throws is counted as a failure, never crashes the run', async () => {
  setVisionModel({ ...stubModel, async extract() { throw new Error('API down'); } });
  try {
    const s = store.create({ jobId: null, goals: ['model'] });
    ingest(s, { source: 'camera', mime: 'image/jpeg', data: JPEG, tier1: { score: 0.8, text: 0.7 } });
    ingest(s, { source: 'camera', mime: 'image/jpeg', data: JPEG, tier1: { score: 0.7, text: 0.7 } });
    ingest(s, { source: 'camera', mime: 'image/jpeg', data: JPEG, tier1: { score: 0.6, text: 0.7 } });
    await run(s);
    assert.equal(events.filter((e) => e.type === 'error').length, policy.MAX_FAILS_PER_KIND);
    assert.equal(events.find((e) => e.type === 'vision_done')!.data.stop, 'nothing_useful');
    assert.equal(s.status, 'waiting');
  } finally {
    setVisionModel(stubModel);
  }
});

// ---------------------------------------------------------------- validation (confidence computed in code)

test('validate: catalog match boosts, junk model is capped, bad date rejected, label words stripped', () => {
  const base = { kind: 'nameplate' as const, legible: true, brand: 'Whirlpool', serial: '', purchase_date: '', store: '', part_numbers: [], date_confidence: 0, part_confidence: 0 };
  assert.equal(cleanModel('MODEL NO. wed 4815 ew'), 'WED4815EW');
  const hit = validate({ ...base, model: 'Model: WED4815EW0', model_confidence: 0.6 }, 'i1', 'claude');
  assert.equal(hit.goalConfidence.model, 0.9);
  const junk = validate({ ...base, model: 'WHIRLPOOL', model_confidence: 0.99 }, 'i2', 'claude');
  assert.ok((junk.goalConfidence.model ?? 1) <= 0.2);
  const date = validate({ ...base, kind: 'receipt', model: '', model_confidence: 0, purchase_date: '2019-02-30', date_confidence: 0.99 }, 'i3', 'claude');
  assert.equal(date.fields.purchaseDate, undefined);
  const blurry = validate({ ...base, legible: false, model: 'XQ12345', model_confidence: 0.9 }, 'i4', 'claude');
  assert.equal(blurry.goalConfidence.model, 0.45);
  const facts = mergeFacts({}, blurry);
  mergeFacts(facts, hit);
  assert.equal(facts.model?.value, 'WED4815EW0');
});

// ---------------------------------------------------------------- session code lifecycle

test('sessions: 4-digit unique codes, lookup by code/job/phone', () => {
  const codes = new Set<string>();
  for (let i = 0; i < 40; i++) codes.add(store.create({ jobId: `job_${i}`, phone: '+1 (619) 555-0100' }).code);
  assert.equal(codes.size, 40);
  for (const c of codes) assert.match(c, /^\d{4}$/);
  const s = store.create({ jobId: 'job_x', phone: '+16195550142' });
  assert.equal(store.get(s.code), s);
  assert.equal(store.byJob('job_x'), s);
  assert.equal(store.byPhone('6195550142'), s);
  assert.equal(store.byPhone('+16195559999'), undefined);
});

test('sessions: expire after the TTL and their images are dropped', () => {
  let now = 1_000_000;
  const st = createStore(() => now);
  const s = st.create({ jobId: 'job_t' });
  st.addImage(s, img('i', 'nameplate', 1));
  now += SESSION_TTL_MS - 1;
  assert.ok(st.get(s.code));
  now += 2;
  assert.equal(st.get(s.code), undefined);
  assert.equal(s.images.length, 0, 'image buffers released');
});

test('sessions: /demo/reset (epoch bump) purges every session', () => {
  const s = store.create({ jobId: 'job_e' });
  bumpEpoch();
  assert.equal(store.get(s.code), undefined);
  assert.equal(store.all().length, 0);
});

test('default goals follow the ask and what the job already knows', async () => {
  const { defaultGoals } = await import('../src/vision/store.ts');
  assert.deepEqual(defaultGoals('nameplate'), ['model', 'purchaseDate']);
  assert.deepEqual(defaultGoals('nameplate', { purchaseYear: 2019 }), ['model']);
  assert.deepEqual(defaultGoals('receipt'), ['purchaseDate']);
});

// ---------------------------------------------------------------- MMS + Twilio

test('MMS: matched to the open job by sender number; non-Twilio media URLs are refused', async () => {
  const job = jobs.create({ kind: 'consumer', customer: { name: 'Dorothy', phone: '+16195550177' }, appliance: 'electric dryer' });
  const r = await handleInboundMms(
    { From: '+16195550177', Body: 'my receipt', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1', MediaContentType0: 'image/jpeg' },
    async () => ({ mime: 'image/jpeg', data: JPEG }),
  );
  assert.equal(r.matched, 'job_phone');
  assert.equal(r.jobId, job.id);
  assert.equal(r.accepted.length, 1);
  assert.equal(store.byJob(job.id)?.ask, 'receipt');
  // Second MMS lands in the same session.
  const r2 = await handleInboundMms({ From: '6195550177', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC1/x' }, async () => ({ mime: 'image/png', data: JPEG }));
  assert.equal(r2.matched, 'session_phone');
  assert.equal(r2.code, r.code);
  assert.ok(events.every((e) => !JSON.stringify(e.data).includes('6195550177')), 'phones are masked in events');
  assert.equal(isTwilioMediaUrl('https://evil.example/2010-04-01/Accounts/x'), false);
  assert.equal(isTwilioMediaUrl('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1'), true);
});

test('MMS: a 4-digit code in the body matches when the number is unknown', async () => {
  const s = store.create({ jobId: 'job_c' });
  const r = await handleInboundMms({ From: '+15555550000', Body: `code ${s.code}`, NumMedia: '1', MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/A/x' }, async () => ({ mime: 'image/jpeg', data: JPEG }));
  assert.equal(r.matched, 'code_in_body');
  assert.equal(r.code, s.code);
});

test('Twilio signature: round trip and tamper rejection', () => {
  const p = { From: '+16195550100', NumMedia: '1', Body: 'hi' };
  const sig = twilioSignature('tok', 'https://x.example/sms/inbound', p);
  assert.ok(validTwilioSignature(sig, 'https://x.example/sms/inbound', p, 'tok'));
  assert.ok(!validTwilioSignature(sig, 'https://x.example/sms/inbound', { ...p, Body: 'evil' }, 'tok'));
  assert.ok(!validTwilioSignature(undefined, 'https://x.example/sms/inbound', p, 'tok'));
});

// ---------------------------------------------------------------- HTTP routes

test('routes: create session → camera page → upload base64 frame → result', async () => {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  register(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/vision/session`, { method: 'POST' })).status, 401);
    const job = jobs.create({ kind: 'consumer', customer: { name: 'Dorothy', phone: '+16195550188' }, appliance: 'electric dryer', purchaseYear: 2019 });
    const created = await (await fetch(`${base}/vision/session`, { method: 'POST', headers: { 'x-admin': config.adminToken, 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id }) })).json();
    assert.match(created.code, /^\d{4}$/);
    assert.ok(created.url.endsWith(`/look/${created.code}`));
    assert.equal(created.sms.sent, false); // DRY_RUN never texts
    assert.match(created.spoken, new RegExp(created.code.split('').join(' ')));
    const ev = events.find((e) => e.type === 'vision_session')!;
    assert.equal(ev.data.phone, '···0188');

    const html = await (await fetch(`${base}/look/${created.code}`)).text();
    assert.match(html, /window\.__LOOK__ = \{"code":"\d{4}","valid":true/);
    assert.equal((await fetch(`${base}/look/0000`)).status === 404 || created.code === '0000', true);
    assert.match(await (await fetch(`${base}/look`)).text(), /"code":null/);

    const dataUrl = `data:image/jpeg;base64,${JPEG.toString('base64')}`;
    const up = await fetch(`${base}/vision/${created.code}/frames`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ frames: [{ image: dataUrl, thumb: dataUrl, tier1: { score: 0.81, sharpness: 0.9, text: 0.7, glare: 0 } }] }) });
    assert.equal(up.status, 200);
    const raw = await fetch(`${base}/vision/${created.code}/frames?score=0.5`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: JPEG });
    assert.equal(raw.status, 200);
    await new Promise((r) => setTimeout(r, 60));
    const s = store.get(created.code)!;
    while (s.running || s.timer) await new Promise((r) => setTimeout(r, 10));
    const result = await (await fetch(`${base}/vision/${created.code}/result`)).json();
    assert.equal(result.done, true);
    assert.equal(result.headline, 'Whirlpool WED4815EW');
    assert.equal(result.tier3Calls, 1, 'early stop after the first confident nameplate');
    assert.equal(JSON.stringify(result).includes('0188'), false);
    assert.match(visualStatus(job.id).spoken, /WED4815EW/);
    assert.equal(events.find((e) => e.type === 'vision_capture')!.data.tier1Score, 0.81);
    assert.equal((await fetch(`${base}/vision/9999x/result`)).status, 404);
  } finally {
    server.close();
  }
});

test('decodeImage rejects non-images and accepts data URLs', () => {
  assert.equal(decodeImage('data:text/html;base64,PGgxPmhpPC9oMT4gICAgICAgICAgICAgICAgICAgICAgICAg'), null);
  assert.equal(decodeImage(`data:image/png;base64,${JPEG.toString('base64')}`)?.mime, 'image/png');
});

test('startVisualSession reuses the open session for a job', async () => {
  const job = jobs.create({ kind: 'consumer', customer: { name: 'D', phone: '+16195550199' } });
  const a = await startVisualSession({ jobId: job.id });
  const b = await startVisualSession({ jobId: job.id });
  assert.equal(a.code, b.code);
  assert.equal(b.reused, true);
  await assert.rejects(startVisualSession({ jobId: 'job_nope' }));
});
