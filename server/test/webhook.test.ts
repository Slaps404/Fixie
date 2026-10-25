import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { CallCtx, CallEvent } from '../src/contracts.ts';
import type { Job } from '../src/types.ts';
import { createWebhookHandler, mapEndedReason, normalize } from '../src/vapi/webhook.ts';
import { buildAssistant, buildIntakeAssistant, SERVER_MESSAGES } from '../src/vapi/assistants.ts';
import { config } from '../src/config.ts';

function harness() {
  const map = new Map<string, CallCtx>();
  const seen: CallEvent[] = [];
  const calls = {
    get: (id: string) => map.get(id),
    register: (c: CallCtx) => void map.set(c.callId, c),
    update: (id: string, patch: Partial<CallCtx>) => {
      const c = map.get(id);
      if (c) Object.assign(c, patch);
      return c;
    },
  };
  let toolRuns = 0;
  const orchestrator = {
    async onCallEvent(e: CallEvent) {
      seen.push(e);
      if (e.kind === 'tool') {
        toolRuns++;
        if (e.name === 'report_fix') throw new Error('boom');
        return `ok:${e.name}`;
      }
      return undefined;
    },
  };
  const handler = createWebhookHandler({ calls, orchestrator });
  const app = express();
  app.use(express.json());
  app.post('/vapi/webhook', handler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (message: unknown) => {
    const res = await fetch(`${base}/vapi/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vapi-Secret': config.webhookSecret },
      body: JSON.stringify({ message }),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  return { map, seen, post, handler, close: () => server.close(), toolRuns: () => toolRuns };
}

const inboundCall = { id: 'in_1', type: 'inboundPhoneCall', customer: { number: '+16195550100' } };

test('tool-calls: inbound start_job registers user ctx, parses string args, replies results', async () => {
  const h = harness();
  try {
    const r = await h.post({
      type: 'tool-calls',
      call: inboundCall,
      toolCallList: [
        { id: 'call_abc', type: 'function', function: { name: 'start_job', arguments: { model: 'WED4815EW' } } },
        { id: 'call_def', type: 'function', function: { name: 'start_job', arguments: '{"symptom":"no heat"}' } },
      ],
      toolWithToolCallList: [],
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      results: [
        { name: 'start_job', toolCallId: 'call_abc', result: 'ok:start_job' },
        { name: 'start_job', toolCallId: 'call_def', result: 'ok:start_job' },
      ],
    });
    const ctx = h.map.get('in_1');
    assert.equal(ctx?.lane, 'user');
    assert.equal(ctx?.jobId, null);
    const [a, b] = h.seen as Array<Extract<CallEvent, { kind: 'tool' }>>;
    assert.equal(a.kind, 'tool');
    assert.deepEqual(a.args, { model: 'WED4815EW' });
    assert.deepEqual(b.args, { symptom: 'no heat' });
    assert.equal(a.fromNumber, '+16195550100');
    assert.equal(a.callType, 'inbound');

    // Dedupe by toolCallId: a retry gets the cached result without re-running.
    const runs = h.toolRuns();
    const again = await h.post({
      type: 'tool-calls',
      call: inboundCall,
      toolCallList: [{ id: 'call_abc', type: 'function', function: { name: 'start_job', arguments: {} } }],
    });
    assert.equal(again.body.results[0].result, 'ok:start_job');
    assert.equal(h.toolRuns(), runs);

    // Errors → "Saved. Keep the conversation going."
    const err = await h.post({
      type: 'tool-calls',
      call: inboundCall,
      toolCallList: [{ id: 'call_x', function: { name: 'report_fix', arguments: { ok: true } } }],
    });
    assert.equal(err.status, 200);
    assert.equal(err.body.results[0].result, 'Saved. Keep the conversation going.');
  } finally {
    h.close();
  }
});

test('status, transcript, end-of-call-report normalize to CallEvents', async () => {
  const h = harness();
  try {
    const call = { id: 'out_1', type: 'outboundPhoneCall', name: 'job_1|valley|supplier', customer: { number: '+16195550102' } };
    h.map.set('out_1', { callId: 'out_1' } as CallCtx);
    for (const m of [
      { type: 'status-update', status: 'ringing', call },
      { type: 'status-update', status: 'in-progress', call },
      { type: 'transcript', role: 'user', transcriptType: 'partial', transcript: 'ign', call },
      { type: 'transcript', role: 'user', transcriptType: 'final', transcript: 'Yes we have it.', call },
      { type: 'transcript', role: 'assistant', transcriptType: 'final', transcript: 'Great.', call },
      { type: 'status-update', status: 'ended', call },
      {
        type: 'end-of-call-report',
        endedReason: 'customer-ended-call',
        call,
        cost: 0.07,
        startedAt: '2026-10-24T19:00:00.000Z',
        endedAt: '2026-10-24T19:00:42.500Z',
        artifact: { transcript: 'AI: hi User: hello', messages: [] },
      },
      { type: 'hang', call },
    ]) {
      const r = await h.post(m);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, {});
    }
    await h.handler.idle();
    assert.deepEqual(h.seen, [
      { kind: 'status', callId: 'out_1', status: 'ringing', fromNumber: '+16195550102', callType: 'outbound' },
      { kind: 'status', callId: 'out_1', status: 'live', fromNumber: '+16195550102', callType: 'outbound' },
      { kind: 'transcript', callId: 'out_1', role: 'other', text: 'Yes we have it.' },
      { kind: 'transcript', callId: 'out_1', role: 'agent', text: 'Great.' },
      { kind: 'status', callId: 'out_1', status: 'ended', fromNumber: '+16195550102', callType: 'outbound' },
      {
        kind: 'ended',
        callId: 'out_1',
        reason: 'completed',
        endedReason: 'customer-ended-call',
        durationSec: 42.5,
        transcript: 'AI: hi User: hello',
        costUsd: 0.07,
      },
    ]);
  } finally {
    h.close();
  }
});

test('unknown outbound call falls back to call.name after waiting', async () => {
  const h = harness();
  try {
    const call = { id: 'out_2', type: 'outboundPhoneCall', name: 'job_7|coast|supplier', customer: { number: '+16195550104' } };
    await h.post({ type: 'end-of-call-report', endedReason: 'customer-did-not-answer', call, artifact: {} });
    await h.handler.idle();
    const ctx = h.map.get('out_2');
    assert.equal(ctx?.jobId, 'job_7');
    assert.equal(ctx?.vendorId, 'coast');
    assert.equal(ctx?.lane, 'supplier');
    const e = h.seen[0] as Extract<CallEvent, { kind: 'ended' }>;
    assert.equal(e.reason, 'no_answer');
    assert.equal(e.durationSec, 0);
    assert.equal(e.costUsd, 0);
  } finally {
    h.close();
  }
});

test('endedReason mapping (SPEC §6)', () => {
  assert.equal(mapEndedReason('voicemail'), 'voicemail');
  assert.equal(mapEndedReason('customer-busy'), 'no_answer');
  assert.equal(mapEndedReason('twilio-failed-to-connect-call'), 'no_answer');
  assert.equal(mapEndedReason('silence-timed-out'), 'timeout');
  assert.equal(mapEndedReason('exceeded-max-duration'), 'timeout');
  assert.equal(mapEndedReason('assistant-said-end-call-phrase'), 'completed');
  assert.equal(mapEndedReason('assistant-ended-call'), 'completed');
  assert.equal(mapEndedReason('pipeline-error-openai-llm-failed'), 'error');
  assert.equal(mapEndedReason('twilio-something-else'), 'error');
  assert.equal(mapEndedReason(undefined), 'error');
  assert.deepEqual(normalize({ type: 'status-update', status: 'queued', call: { id: 'x' } }), []);
});

const job: Job = {
  id: 'job_1',
  kind: 'consumer',
  state: 'SOURCING',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  customer: { name: 'Dorothy', phone: '+16195550100' },
  appliance: 'dryer',
  model: 'WED4815EW',
  symptom: 'no heat',
  part: {
    partNumber: 'WP3392519',
    name: 'Dryer thermal fuse',
    crossRefs: ['3392519'],
    safety: 'diy_with_caution',
    safetyNote: '',
    techVisitCost: 200,
    installSteps: ['Unplug it.', 'Plug in and run it.'],
  },
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
};

test('buildAssistant matches the SPEC §6 shape', () => {
  const vendor = { id: 'valley', name: 'Valley Appliance Parts', phone: '+16195550102', lane: 'supplier' as const };
  const a = buildAssistant({ lane: 'supplier', job, vendor, attempt: 1 }) as any;
  assert.equal(a.firstMessageMode, 'assistant-speaks-first');
  assert.match(a.firstMessage, /AI assistant/);
  assert.match(a.firstMessage, /recorded/);
  assert.equal(a.model.provider, 'anthropic');
  assert.equal(a.model.model, 'claude-haiku-5-5');
  assert.match(a.model.messages[0].content, /record_quote/);
  assert.equal(a.maxDurationSeconds, config.maxSec.supplier);
  assert.equal(a.silenceTimeoutSeconds, 15);
  assert.equal(a.voicemailDetection, undefined);
  assert.deepEqual(a.serverMessages, SERVER_MESSAGES);
  assert.equal(a.server.url, `${config.publicUrl}/vapi/webhook`);
  assert.equal(a.server.timeoutSeconds, 20);
  assert.equal(a.metadata.jobId, 'job_1');
  assert.equal(a.metadata.vendorId, 'valley');
  assert.equal(a.metadata.lane, 'supplier');
  const fn = a.model.tools.find((t: any) => t.type === 'function');
  assert.equal(fn.function.name, 'record_quote');
  assert.deepEqual(fn.server.url, a.server.url);
  // Supplier can't hang up on its own: only our end_call, which refuses until a quote is recorded.
  assert.ok(a.model.tools.some((t: any) => t.function?.name === 'end_call'));
  assert.ok(!a.model.tools.some((t: any) => t.type === 'endCall'));
  assert.match(a.model.messages[0].content, /Never call end_call before record_quote/);

  const cb = buildAssistant({ lane: 'user', job, attempt: 1 }) as any;
  assert.ok(cb.model.tools.some((t: any) => t.type === 'endCall'));
  assert.equal(cb.model.model, process.env.FIXIE_CUSTOMER_MODEL || 'claude-haiku-5-5');
  assert.match(cb.firstMessage, /the AI assistant you called at .+ about your dryer/);
  const priced = buildAssistant({
    lane: 'user',
    job: { ...job, bestDeal: { supplier: 'PartsDirect', price: 15, shipping: 0, landedTotal: 15, inStock: true, eta: 'Tuesday' } as any },
    attempt: 1,
  }) as any;
  assert.match(priced.firstMessage, /fifteen dollars total with shipping, arriving Tuesday\. Want me to order it\?$/);

  const d = buildAssistant({ lane: 'delivery', job, attempt: 1 }) as any;
  const deliveryTools = d.model.tools.filter((t: any) => t.type === 'function').map((t: any) => t.function.name);
  for (const name of ['safety_ack', 'install_progress', 'report_fix', 'record_knowledge', 'send_text', 'save_note']) assert.ok(deliveryTools.includes(name), name);
  const intakeTools = (buildIntakeAssistant() as any).model.tools.map((t: any) => t.function?.name);
  for (const name of ['mark_delivered', 'install_progress', 'record_order_decision', 'send_text', 'save_note']) assert.ok(intakeTools.includes(name), name);

  const intake = buildIntakeAssistant() as any;
  assert.equal(intake.model.tools[0].function.name, 'lookup_caller');
  const sj = intake.model.tools.find((t: any) => t.function?.name === 'start_job').function;
  assert.equal(sj.parameters.properties.phone, undefined);
  const toolNames = intake.model.tools.map((t: any) => t.function?.name).filter(Boolean);
  assert.ok(toolNames.includes('record_test') && toolNames.includes('safety_ack'));
  const rt = intake.model.tools.find((t: any) => t.function?.name === 'record_test').function;
  assert.deepEqual(rt.parameters.required, ['test', 'reading']);
  assert.match(intake.model.messages[0].content, /record_test/);
  assert.match(intake.firstMessage, /recorded line/);
  assert.ok(toolNames.includes('lookup_caller'));
  const lc = intake.model.tools.find((t: any) => t.function?.name === 'lookup_caller').function;
  assert.deepEqual(lc.parameters.properties, {});
  assert.match(intake.model.messages[0].content, /lookup_caller/);
  assert.match(intake.model.messages[0].content, /has_meter/);
  assert.match(intake.model.messages[0].content, /No problem, we'll skip that/);
  assert.match(intake.model.messages[0].content, /sound wave/);
  assert.match(intake.model.messages[0].content, /small white oval piece behind the back panel/);
});

test('tool-calls: lookup_caller passes through with empty args and caller id', async () => {
  const h = harness();
  try {
    const r = await h.post({
      type: 'tool-calls',
      call: inboundCall,
      toolCallList: [{ id: 'call_lc', type: 'function', function: { name: 'lookup_caller', arguments: '{}' } }],
    });
    assert.deepEqual(r.body, { results: [{ name: 'lookup_caller', toolCallId: 'call_lc', result: 'ok:lookup_caller' }] });
    const ev = h.seen[0] as Extract<CallEvent, { kind: 'tool' }>;
    assert.equal(ev.name, 'lookup_caller');
    assert.deepEqual(ev.args, {});
    assert.equal(ev.fromNumber, '+16195550100');
    assert.equal(ev.callType, 'inbound');
  } finally {
    h.close();
  }
});

test('tool-calls: flat {id,name,parameters} shape and toolWithToolCallList merge', async () => {
  const flat = normalize({
    type: 'tool-calls',
    call: inboundCall,
    toolCallList: [{ id: 'c1', name: 'start_job', parameters: { model: 'WED4815EW' } }],
  });
  assert.equal(flat.length, 1);
  assert.deepEqual((flat[0] as any).args, { model: 'WED4815EW' });

  const merged = normalize({
    type: 'tool-calls',
    call: inboundCall,
    toolCallList: [{ id: 'c2', name: 'start_job' }],
    toolWithToolCallList: [{ toolCall: { id: 'c2', function: { name: 'start_job', arguments: { model: 'X1' } } } }],
  });
  assert.equal(merged.length, 1);
  assert.deepEqual((merged[0] as any).args, { model: 'X1' });
});

test('tool-calls: record_test passes through with test/reading args', async () => {
  const h = harness();
  try {
    const r = await h.post({
      type: 'tool-calls',
      call: inboundCall,
      toolCallList: [
        { id: 'call_rt', type: 'function', function: { name: 'record_test', arguments: '{"test":"fuse_continuity","reading":"open"}' } },
      ],
    });
    assert.deepEqual(r.body, { results: [{ name: 'record_test', toolCallId: 'call_rt', result: 'ok:record_test' }] });
    const ev = h.seen[0] as Extract<CallEvent, { kind: 'tool' }>;
    assert.equal(ev.name, 'record_test');
    assert.deepEqual(ev.args, { test: 'fuse_continuity', reading: 'open' });
    assert.equal(ev.callId, 'in_1');
    assert.equal(h.map.get('in_1')?.jobId, null);
  } finally {
    h.close();
  }
});
