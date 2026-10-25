import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CallCtx } from '../src/contracts.ts';
import { initialState, loadFaultTree } from '../src/diagnosis.ts';
import { onEvent } from '../src/events.ts';
import { buildExpertPrompt, expert, setExpertModel, stubNote, type ExpertFacts, type ExpertModel, type Line } from '../src/expert.ts';
import type { FixieEvent } from '../src/types.ts';

const facts: ExpertFacts = { lane: 'intake', memory: 'New caller.', diagnosis: initialState(loadFaultTree('dryer_no_heat')) };

function ctxFor(callId: string, controlUrl?: string): CallCtx {
  return { callId, jobId: null, lane: 'user', to: '+16195550100', maxSec: 300, mode: 'sim', epoch: 1, state: 'live', createdAt: Date.now(), quoted: false, attempt: 1, controlUrl };
}

/** Fake model: records what each consult saw, answers after `delayMs`. */
function fakeModel(reply: (n: number) => string, delayMs = 0) {
  const seen: Line[][] = [];
  const model: ExpertModel = {
    name: 'fake',
    async consult({ lines }) {
      seen.push(lines);
      await new Promise((r) => setTimeout(r, delayMs));
      return reply(seen.length);
    },
  };
  return { model, seen };
}

function expertNotes(callId: string) {
  const got: FixieEvent[] = [];
  const off = onEvent((ev) => {
    if (ev.type === 'note' && ev.data.kind === 'expert' && ev.data.callId === callId) got.push(ev);
  });
  return { got, off };
}

test('three quick caller lines run at most two consults, and the rerun sees the newest line', async () => {
  const { model, seen } = fakeModel((n) => `Coach: guess=fuse ${n}`, 40);
  setExpertModel(model);
  const ctx = ctxFor('ex_flight');
  const runs = [
    expert.onTranscript(ctx, 'caller', 'my dryer runs but no heat', () => facts),
    expert.onTranscript(ctx, 'caller', 'it is a Whirlpool', () => facts),
    expert.onTranscript(ctx, 'caller', 'bought in 2019', () => facts),
  ];
  await Promise.all(runs);
  assert.ok(seen.length <= 2, `consults: ${seen.length}`);
  assert.equal(seen.at(-1)?.at(-1)?.text, 'bought in 2019');
  expert.end(ctx.callId);
  setExpertModel(null);
});

test('agent lines are context only and never start a consult', async () => {
  const { model, seen } = fakeModel(() => 'Coach: guess=fuse');
  setExpertModel(model);
  const ctx = ctxFor('ex_agent');
  await expert.onTranscript(ctx, 'agent', 'Does the drum turn?', () => facts);
  assert.equal(seen.length, 0);
  await expert.onTranscript(ctx, 'caller', 'yes it turns', () => facts);
  assert.deepEqual(seen[0].map((l) => l.who), ['agent', 'caller']);
  expert.end(ctx.callId);
  setExpertModel(null);
});

test('a call gets at most 15 consults', async () => {
  const { model, seen } = fakeModel((n) => `Coach: note ${n}`);
  setExpertModel(model);
  const ctx = ctxFor('ex_cap');
  for (let i = 0; i < 20; i++) await expert.onTranscript(ctx, 'caller', `line ${i}`, () => facts);
  assert.equal(seen.length, 15);
  expert.end(ctx.callId);
  setExpertModel(null);
});

test('posts a silent add-message to the controlUrl and emits an expert note', async () => {
  const bodies: unknown[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      bodies.push(JSON.parse(raw));
      res.end('{}');
    });
  }).listen(0);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/control`;
  setExpertModel(fakeModel(() => 'Coach: guess=thermal fuse; fix=swap it; next=does the drum turn?; plain=yes').model);
  const ctx = ctxFor('ex_post', url);
  const { got, off } = expertNotes(ctx.callId);
  try {
    await expert.onTranscript(ctx, 'caller', 'no heat at all', () => facts);
    const note = 'Coach: guess=thermal fuse; fix=swap it; next=does the drum turn?; plain=yes';
    assert.deepEqual(bodies, [{ type: 'add-message', message: { role: 'system', content: note }, triggerResponseEnabled: false }]);
    assert.equal(got.length, 1);
    assert.equal(got[0].data.text, note);
    assert.equal(got[0].data.delivered, true);
    assert.equal(got[0].data.model, 'fake');
    assert.equal(got[0].simulated, true);
  } finally {
    off();
    server.close();
    expert.end(ctx.callId);
    setExpertModel(null);
  }
});

test('a note identical to the last one is skipped', async () => {
  const { model, seen } = fakeModel(() => 'Coach: guess=thermal fuse');
  setExpertModel(model);
  const ctx = ctxFor('ex_dup');
  const { got, off } = expertNotes(ctx.callId);
  await expert.onTranscript(ctx, 'caller', 'no heat', () => facts);
  await expert.onTranscript(ctx, 'caller', 'still no heat', () => facts);
  off();
  assert.equal(seen.length, 2);
  assert.equal(got.length, 1);
  assert.equal(got[0].data.delivered, false);
  expert.end(ctx.callId);
  setExpertModel(null);
});

test('the prompt carries the server diagnosis; the stub note follows it and flags confusion', () => {
  const lines: Line[] = [{ who: 'agent', text: 'Do you have a multimeter?' }, { who: 'caller', text: "what's that?" }];
  const p = buildExpertPrompt(lines, facts);
  assert.match(p.user, /thermal fuse 45%/);
  assert.match(p.user, /Caller: what's that\?/);
  assert.match(p.system, /under 45 words/);
  const note = stubNote(lines, facts);
  assert.match(note, /^Coach: guess=thermal fuse 45%; fix=.+; next=they sound confused.+; plain=yes$/);
});
