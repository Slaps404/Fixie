import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DRY_RUN = '1';
process.env.CUSTOMERS_FILE = join(mkdtempSync(join(tmpdir(), 'fixie-mem-')), 'customers.json');

const { knowsConcept, rememberKnowledge, summarize, updateProfile } = await import('../src/memory.ts');
const { buildAssistant, buildIntakeAssistant } = await import('../src/vapi/assistants.ts');
type Profile = NonNullable<Parameters<typeof knowsConcept>[0]>;

const blank = (): Profile => ({ phone: '6195550100', appliances: [], jobs: [], notes: [] });

test('ladder: not knowing an easy concept implies not knowing harder ones', () => {
  const p = blank();
  rememberKnowledge(p, 'breaker_box', false);
  assert.equal(knowsConcept(p, 'breaker_box'), false);
  assert.equal(knowsConcept(p, 'fuse'), false);
  assert.equal(knowsConcept(p, 'multimeter'), false);
  assert.equal(knowsConcept(p, 'continuity_test'), false);
});

test('ladder: knowing a hard concept implies knowing easier ones', () => {
  const p = blank();
  rememberKnowledge(p, 'multimeter', true);
  assert.equal(knowsConcept(p, 'breaker_box'), true);
  assert.equal(knowsConcept(p, 'fuse'), true);
  assert.equal(knowsConcept(p, 'continuity_test'), undefined);
  assert.equal(knowsConcept(undefined, 'fuse'), undefined);
});

test('ladder: an explicit answer beats inference', () => {
  const p = blank();
  rememberKnowledge(p, 'breaker_box', false);
  rememberKnowledge(p, 'fuse', true);
  assert.equal(knowsConcept(p, 'fuse'), true);
  assert.equal(knowsConcept(p, 'breaker_box'), false);
});

test('summarize: returning caller gets a greeting, appliance, and what they do not know', () => {
  const p = blank();
  p.name = 'Bao';
  p.appliances.push({ appliance: 'Whirlpool dryer', model: 'WED4815EW', purchaseYear: 2019 });
  rememberKnowledge(p, 'breaker_box', false);
  const s = summarize(p);
  assert.match(s, /Greet: "Welcome back, Bao! It's Fixie again\."/);
  assert.match(s, /Whirlpool dryer WED4815EW/);
  assert.match(s, /Doesn't know: breaker box, so assume not fuse, multimeter, continuity test either\. Use plain words/);
  assert.equal(summarize(undefined), 'New caller.');
  assert.equal(summarize(blank()), 'New caller.');
});

test('summarize: names what the caller does know, including inferred concepts', () => {
  const p = blank();
  rememberKnowledge(p, 'multimeter', true);
  assert.match(summarize(p), /Does know: breaker box, fuse, multimeter\./);
});

/** The real orchestrator needs tsx's loader, so the end-to-end webhook flows run in a child process. */
function driveWebhook(): Record<string, string> {
  const run = spawnSync(process.execPath, ['--import', 'tsx', join(import.meta.dirname, 'helpers', 'drive-webhook.ts')], {
    env: { ...process.env, DRY_RUN: '1', VAPI_API_KEY: '', CUSTOMERS_FILE: join(mkdtempSync(join(tmpdir(), 'fixie-drive-')), 'c.json') },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout.trim().split('\n').pop() as string);
}

const driven = driveWebhook();

test('webhook: knowledge recorded on one call is reported on the next call from the same phone', () => {
  assert.equal(driven.recorded, 'Noted.');
  assert.match(driven.lookupSamePhone, /Doesn't know: breaker box, so assume not fuse, multimeter, continuity test either/);
  assert.equal(driven.lookupOtherPhone, 'New caller.');
  assert.equal(driven.unknownConcept, 'Noted.');
});

test('webhook: has_meter "unknown" also records that they do not know what a multimeter is', () => {
  assert.match(driven.lookupAfterMeter, /Doesn't know: multimeter, so assume not continuity test either/);
});

test('webhook: record_test states the best guess and fix once, then stays quiet while it is unchanged', () => {
  assert.match(driven.firstTest, /^Best guess so far: thermal fuse \(\d+%\), fix: a cheap thermal fuse/);
  assert.match(driven.firstTest, /Next, ask them:/);
  assert.doesNotMatch(driven.secondTest, /Best guess so far/);
  assert.match(driven.secondTest, /Next, ask them:|confirms it|No further safe tests/);
});

test('intake assistant: tuned for conversation, async knowledge tool, no filler instruction', () => {
  const a = buildIntakeAssistant() as any;
  assert.equal(a.stopSpeakingPlan.numWords, 3);
  assert.equal(a.startSpeakingPlan.smartEndpointingPlan.provider, 'livekit');
  assert.deepEqual(a.backgroundSpeechDenoisingPlan, { smartDenoisingPlan: { enabled: true } });
  const k = a.model.tools.find((t: any) => t.function?.name === 'record_knowledge');
  assert.equal(k.async, true);
  assert.deepEqual(k.function.parameters.properties.concept.enum, ['breaker_box', 'fuse', 'multimeter', 'continuity_test']);
  const prompt: string = a.model.messages[0].content;
  const stripped = prompt.replace(/Never say "hold on"[^.]*\./, '');
  assert.doesNotMatch(stripped, /one sec|hold on|give me a moment|let me check/i);
});

test('supplier assistant keeps Vapi default interruption behavior', () => {
  const a = buildAssistant({ lane: 'supplier', job: { id: 'j1', calls: [], notes: [] } as any, attempt: 1 } as any) as any;
  assert.equal(a.stopSpeakingPlan, undefined);
  assert.equal(a.startSpeakingPlan, undefined);
  assert.equal(a.model.model, 'claude-haiku-5-5');
});

test('updateProfile persists knowledge across a reload', async () => {
  const { reloadMemory, getProfile } = await import('../src/memory.ts');
  updateProfile('+15555550177', (p) => rememberKnowledge(p, 'fuse', false));
  reloadMemory();
  assert.equal(knowsConcept(getProfile('5555550177'), 'multimeter'), false);
});

test('webhook: a caller who does not know what a breaker is never gets the breaker test', () => {
  assert.match(driven.secondTest, /breaker box/);
  assert.doesNotMatch(driven.noBreakerCaller, /breaker/i);
  assert.match(driven.noBreakerCaller, /Call start_job/);
});

test('webhook: start_job with empty args asks for the facts and does not lock the call into an escalation', () => {
  assert.match(driven.emptyStartJob, /call start_job again/i);
  assert.match(driven.fullStartJobAfterEmpty, /thermal fuse/);
  assert.equal(driven.emptyStartJobState, 'DIAGNOSED');
});

test('webhook: a supplier call cannot hang up before a quote; it is told to ask the price once, then may hang up', () => {
  assert.match(driven.endBeforeQuote, /no price/);
  assert.match(driven.endBeforeQuote, /record_quote/);
  assert.match(driven.endBeforeQuoteAgain, /^Hanging up/);
  assert.match(driven.endAfterQuoteCall, /call end_call/);
  assert.match(driven.endAfterQuote, /^Hanging up/);
});

test('webhook: a caller whose part arrived can install on an inbound call, get a text, and leave a note for next time', () => {
  assert.match(driven.lookupOrdered, /mark_delivered/);
  assert.match(driven.delivered, /^Delivered\. Install is \d+ steps/);
  assert.equal(driven.deliveredState, 'DELIVERED');
  assert.match(driven.delivered, /safety_ack/);
  assert.match(driven.installStep1, /^Step 2 of \d+/);
  assert.equal(driven.installState, 'INSTALLING');
  assert.equal(driven.text, 'Text sent.');
  assert.equal(driven.note, 'Saved.');
  assert.match(driven.lookupNextCall, /Prefers a text before each call/);
  assert.match(driven.lookupNextCall, /Install is at step 1 of/);
});
