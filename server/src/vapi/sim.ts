// Simulator provider: produces the same raw Vapi webhook JSON that a live call would, and POSTs it to
// our own /vapi/webhook so sim lanes exercise the real webhook → orchestrator path. Never imports
// orchestrator/jobs. Every timing is scaled by config.simSpeed.
import { config, getEpoch, loadRoster } from '../config.ts';
import { maskPhone } from '../events.ts';
import type { CallCtx, VoiceProvider } from '../contracts.ts';
import type { Lane, RosterEntry } from '../types.ts';

type Role = 'agent' | 'other';
type CreateReq = Parameters<VoiceProvider['createCall']>[0];

interface SimCall {
  id: string;
  call: Record<string, unknown>;
  epoch: number;
  startedAt: number;
  liveAt?: number;
  lines: string[];
  timers: Set<NodeJS.Timeout>;
  wakers: Set<() => void>;
  cancelled: boolean;
  ended: boolean;
}

const active = new Map<string, SimCall>();
let seq = 0;
let toolSeq = 0;

const speed = () => (config.simSpeed > 0 ? config.simSpeed : 1);
const webhookUrl = () => `http://localhost:${config.port}/vapi/webhook`;

function log(msg: string): void {
  console.log(`[sim] ${msg}`);
}

function alive(c: SimCall): boolean {
  return !c.cancelled && !c.ended && c.epoch === getEpoch();
}

/** First webhook delay: lets the dialer register the CallCtx before the first event lands (never under 250 ms real). */
const firstDelay = () => Math.max(300, 250 * speed());

/** Sleep `ms` (at speed 1) scaled by simSpeed. Resolves early (returning false) if the call is cancelled. */
function sleep(c: SimCall, ms: number): Promise<boolean> {
  const real = Math.max(50, Math.round(ms / speed()));
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(t);
      c.timers.delete(t);
      c.wakers.delete(wake);
      resolve(false);
    };
    const t = setTimeout(() => {
      c.timers.delete(t);
      c.wakers.delete(wake);
      resolve(alive(c));
    }, real);
    c.timers.add(t);
    c.wakers.add(wake);
  });
}

function cancel(c: SimCall): void {
  c.cancelled = true;
  for (const t of c.timers) clearTimeout(t);
  c.timers.clear();
  for (const w of [...c.wakers]) w();
}

async function post(message: Record<string, unknown>): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.webhookSecret) headers['X-Vapi-Secret'] = config.webhookSecret;
  try {
    const res = await fetch(webhookUrl(), { method: 'POST', headers, body: JSON.stringify({ message }) });
    const text = await res.text();
    if (!res.ok) log(`webhook ${String(message.type)} -> HTTP ${res.status}`);
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  } catch (err) {
    log(`webhook ${String(message.type)} failed: ${(err as Error).message}`);
    return {};
  }
}

async function status(c: SimCall, s: 'ringing' | 'in-progress' | 'ended', endedReason?: string): Promise<void> {
  if (s === 'in-progress') c.liveAt = Date.now();
  const msg: Record<string, unknown> = { type: 'status-update', status: s, call: c.call, timestamp: Date.now() };
  if (endedReason) msg.endedReason = endedReason;
  await post(msg);
}

async function say(c: SimCall, role: Role, text: string): Promise<void> {
  if (!text) return;
  c.lines.push(`${role === 'agent' ? 'AI' : 'User'}: ${text}`);
  await post({
    type: 'transcript',
    role: role === 'agent' ? 'assistant' : 'user',
    transcriptType: 'final',
    transcript: text,
    call: c.call,
    timestamp: Date.now(),
  });
}

/** POST a tool-calls message, read the server's `result`, and speak it as the agent's next line. */
async function tool(c: SimCall, name: string, args: Record<string, unknown>): Promise<string> {
  const toolCallId = `call_sim_${++toolSeq}`;
  const fn = { name, arguments: args };
  const reply = (await post({
    type: 'tool-calls',
    call: c.call,
    toolCallList: [{ id: toolCallId, type: 'function', function: fn }],
    toolWithToolCallList: [{ type: 'function', function: { name }, toolCall: { id: toolCallId, type: 'function', function: fn } }],
    timestamp: Date.now(),
  })) as { results?: Array<{ toolCallId?: string; result?: unknown; error?: unknown }> } | undefined;
  const r = reply?.results?.find((x) => x.toolCallId === toolCallId) ?? reply?.results?.[0];
  const result = r?.result ?? r?.error;
  const text = typeof result === 'string' ? result : result != null ? JSON.stringify(result) : '';
  if (text && alive(c)) await say(c, 'agent', text);
  return text;
}

/** Ends the call: status ended + end-of-call-report. Idempotent. */
async function finish(c: SimCall, endedReason: string): Promise<void> {
  if (c.ended) return;
  if (c.epoch !== getEpoch()) {
    cancel(c);
    active.delete(c.id);
    return;
  }
  c.ended = true;
  cancel(c);
  active.delete(c.id);
  const endedAt = Date.now();
  // Report call length in "call time" (real elapsed x speed) so minutes guards see realistic numbers.
  const durationSeconds = c.liveAt ? Math.round(((endedAt - c.liveAt) / 1000) * speed() * 10) / 10 : 0;
  const n = Number(c.id.replace(/\D/g, '')) || 0;
  const cost = c.liveAt ? Math.round((0.04 + (n % 5) * 0.02) * 100) / 100 : 0;
  await status(c, 'ended', endedReason);
  await post({
    type: 'end-of-call-report',
    endedReason,
    call: c.call,
    cost,
    durationSeconds,
    startedAt: new Date(c.liveAt ?? c.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    artifact: { transcript: c.lines.join('\n'), messages: [] },
    timestamp: endedAt,
  });
  log(`${c.id} ended (${endedReason})`);
}

function newCall(id: string, call: Record<string, unknown>, epoch: number): SimCall {
  const c: SimCall = {
    id,
    call,
    epoch,
    startedAt: Date.now(),
    lines: [],
    timers: new Set(),
    wakers: new Set(),
    cancelled: false,
    ended: false,
  };
  active.set(id, c);
  return c;
}

// ---------- lane scripts ----------

function personaFor(req: CreateReq): string {
  if (req.spec.vendor?.simPersona) return req.spec.vendor.simPersona;
  try {
    const roster = loadRoster();
    const all: RosterEntry[] = [roster.warranty, ...roster.suppliers];
    const hit = all.find((e) => e.id === req.ctx.vendorId);
    if (hit?.simPersona) return hit.simPersona;
  } catch {
    // fall through to lane defaults
  }
  return req.ctx.lane === 'warranty' ? 'out_of_warranty' : 'quote:12.00:4.00:in_stock:Thursday';
}

const DEFAULT_PART = 'WP3392519';
/** Enterprise (fleet) parts cost far more than the dryer fuse; scale persona prices so the tech budget logic is exercised. */
const ENTERPRISE_PRICE_SCALE = 20;

/** The CURRENT job's part number (from the AssistantSpec), spoken letter by letter like a phone readback. */
const partFor = (req: CreateReq): string => req.spec.job?.part?.partNumber || DEFAULT_PART;
const spellOut = (pn: string): string => pn.split('').join('-');

async function ringThenAnswer(c: SimCall): Promise<boolean> {
  if (!(await sleep(c, firstDelay()))) return false;
  await status(c, 'ringing');
  if (!(await sleep(c, 1500))) return false;
  await status(c, 'in-progress');
  return alive(c);
}

async function supplierScript(c: SimCall, persona: string, name: string, req?: CreateReq): Promise<void> {
  const PART = req ? partFor(req) : DEFAULT_PART;
  if (persona === 'no_answer') {
    if (!(await sleep(c, firstDelay()))) return;
    await status(c, 'ringing');
    if (!(await sleep(c, 6000))) return;
    await finish(c, 'customer-did-not-answer');
    return;
  }
  if (persona === 'hold') {
    // Verification persona: answers, says "please hold", never quotes. Runs until the guards end the call.
    if (!(await ringThenAnswer(c))) return;
    await say(c, 'agent', `Hi, I'm an AI assistant calling for a customer; this call is recorded. Do you have part ${PART} in stock?`);
    while (await sleep(c, 2500)) await say(c, 'other', 'Please hold, I will be right with you...');
    return;
  }
  const [, p, s, stock, ...etaParts] = persona.split(':');
  const scale = req?.spec.job?.kind === 'enterprise' ? ENTERPRISE_PRICE_SCALE : 1;
  const price = Math.round((Number(p) || 0) * scale * 100) / 100;
  const shipping = Math.round((Number(s) || 0) * scale * 100) / 100;
  const inStock = stock !== 'out_of_stock';
  const eta = etaParts.join(':') || null;
  if (!(await ringThenAnswer(c))) return;
  await say(c, 'agent', `Hi, I'm an AI assistant calling for a customer; this call is recorded. Do you have part ${PART} in stock?`);
  if (!(await sleep(c, 2000))) return;
  await say(c, 'other', `${name}, let me check... yes, ${spellOut(PART)}, that one. ${inStock ? 'We have it.' : 'Out of stock right now.'}`);
  if (!(await sleep(c, 1800))) return;
  await say(c, 'other', `It's $${price.toFixed(2)}, plus $${shipping.toFixed(2)} shipping${eta ? `, ${eta}` : ''}.`);
  if (!(await sleep(c, 1200))) return;
  await tool(c, 'record_quote', { price, shipping, inStock, eta, partNumberSaid: PART });
  if (!(await sleep(c, 1500))) return;
  await say(c, 'other', 'You got it. Bye now.');
  if (!(await sleep(c, 800))) return;
  await finish(c, 'customer-ended-call');
}

async function warrantyScript(c: SimCall, persona: string): Promise<void> {
  if (persona === 'no_answer') return supplierScript(c, persona, '');
  if (!(await ringThenAnswer(c))) return;
  await say(c, 'agent', "Hi, I'm an AI assistant calling for a customer; this call is recorded. I'm checking warranty on a Whirlpool dryer, model W-E-D-4-8-1-5-E-W.");
  if (!(await sleep(c, 2200))) return;
  const covered = persona === 'covered';
  const detail = covered ? 'Purchased within the last year; parts covered under warranty' : 'Purchased 2019; 1-year parts warranty expired';
  await say(c, 'other', covered ? "That unit's still under the one-year parts warranty, so the fuse is covered." : 'I see it was purchased in 2019. The one-year parts warranty has expired, sorry.');
  if (!(await sleep(c, 1200))) return;
  await tool(c, 'record_warranty', { covered, detail });
  if (!(await sleep(c, 1500))) return;
  await say(c, 'other', 'Anything else? Okay, take care.');
  if (!(await sleep(c, 800))) return;
  await finish(c, 'customer-ended-call');
}

/** roster.user.simPersona: 'decline' makes the callback say no to the order. */
function userPersona(): string {
  try {
    return loadRoster().user.simPersona ?? '';
  } catch {
    return '';
  }
}

async function userScript(c: SimCall, persona = ''): Promise<void> {
  if (!(await ringThenAnswer(c))) return;
  await say(c, 'other', 'Hello?');
  if (!(await sleep(c, 1000))) return;
  await say(c, 'agent', "Hi Dorothy, it's Fixie, the AI assistant you called earlier about your dryer. I found the part.");
  if (!(await sleep(c, 2000))) return;
  await say(c, 'agent', "It's the thermal fuse, WP3392519, at the best landed price I found, arriving soon. Shall I order it? Just say 'order it'.");
  if (!(await sleep(c, 2200))) return;
  const approved = persona !== 'decline';
  await say(c, 'other', approved ? 'Order it.' : "No thanks, not right now.");
  if (!(await sleep(c, 800))) return;
  await tool(c, 'record_order_decision', { approved });
  if (!(await sleep(c, 1500))) return;
  await say(c, 'other', approved ? 'Thank you, dear.' : 'Okay, goodbye.');
  if (!(await sleep(c, 800))) return;
  await finish(c, 'assistant-ended-call');
}

const STEP_REPLIES = [
  "Okay, it's pulled out from the wall.",
  'Vent hose is off.',
  'Back panel is off.',
  'I see the little white fuse.',
  'Old fuse is out.',
  'New fuse is mounted, wires are on.',
  "Panel's back on and it's plugged in.",
];

async function deliveryScript(c: SimCall, req: CreateReq): Promise<void> {
  const total = req.spec.job?.part?.installSteps?.length || STEP_REPLIES.length;
  if (!(await ringThenAnswer(c))) return;
  await say(c, 'agent', "Hi Dorothy, it's Fixie. Your thermal fuse arrived. Want me to walk you through the install? First, please unplug the dryer.");
  if (!(await sleep(c, 2000))) return;
  // Walk the steps one at a time. unplugged is acked before step 2, vent_cleared before the last step.
  for (let step = 1; step <= total; step++) {
    if (step === 2) {
      await say(c, 'other', "Okay, it's unplugged.");
      if (!(await sleep(c, 800))) return;
      await tool(c, 'safety_ack', { kind: 'unplugged' });
      if (!(await sleep(c, 1200))) return;
    }
    if (step === total && total > 1) {
      await say(c, 'other', "I cleaned out the vent hose, it's clear now.");
      if (!(await sleep(c, 800))) return;
      await tool(c, 'safety_ack', { kind: 'vent_cleared' });
      if (!(await sleep(c, 1200))) return;
    }
    await say(c, 'other', STEP_REPLIES[Math.min(step - 1, STEP_REPLIES.length - 1)]);
    if (!(await sleep(c, 700))) return;
    await tool(c, 'install_progress', { step });
    if (!(await sleep(c, 1200))) return;
  }
  await say(c, 'other', "It's warm!");
  if (!(await sleep(c, 800))) return;
  await tool(c, 'report_fix', { ok: true });
  if (!(await sleep(c, 1500))) return;
  await say(c, 'other', 'Thank you so much!');
  if (!(await sleep(c, 800))) return;
  await finish(c, 'assistant-ended-call');
}

async function techScript(c: SimCall): Promise<void> {
  if (!(await ringThenAnswer(c))) return;
  await say(c, 'agent', "Hi, it's Fixie for the yard. There's a NOx sensor fault on a terminal tractor; the part is sourced. Can you take the job?");
  if (!(await sleep(c, 2000))) return;
  await say(c, 'other', "Copy that, I'll lock it out and swap it this shift.");
  if (!(await sleep(c, 1000))) return;
  await finish(c, 'customer-ended-call');
}

async function runScript(c: SimCall, req: CreateReq): Promise<void> {
  const lane: Lane = req.ctx.lane;
  switch (lane) {
    case 'supplier':
      return supplierScript(c, personaFor(req), req.spec.vendor?.name ?? 'Parts counter', req);
    case 'warranty':
      return warrantyScript(c, personaFor(req));
    case 'user':
      return userScript(c, userPersona());
    case 'delivery':
      return deliveryScript(c, req);
    case 'tech':
      return techScript(c);
  }
}

// ---------- provider ----------

export const simProvider: VoiceProvider & {
  simulateInbound(opts?: { from?: string; text?: string; symptom?: string }): Promise<string>;
} = {
  async createCall(req) {
    const callId = `sim_${++seq}`;
    const call = {
      id: callId,
      name: req.name,
      type: 'outboundPhoneCall',
      customer: { number: req.to },
      assistant: { metadata: { ...req.ctx } },
    };
    const c = newCall(callId, call, req.ctx.epoch ?? getEpoch());
    log(`createCall ${callId} lane=${req.ctx.lane} to=${maskPhone(req.to)}`);
    runScript(c, req).catch((err) => log(`${callId} script error: ${(err as Error).message}`));
    return { callId };
  },

  async endCall(ctx: CallCtx) {
    const c = active.get(ctx.callId);
    if (!c) return;
    cancel(c);
    await finish(c, 'assistant-ended-call');
  },

  async simulateInbound(opts = {}) {
    let from = opts.from;
    if (!from) {
      try {
        from = loadRoster().user.phone;
      } catch {
        from = '+16195550100';
      }
    }
    const callId = `sim_${++seq}`;
    const call = { id: callId, type: 'inboundPhoneCall', customer: { number: from } };
    const c = newCall(callId, call, getEpoch());
    log(`simulateInbound ${callId} from=${maskPhone(from)}`);
    const text =
      opts.text ?? "My dryer runs but the clothes come out cold. It's a Whirlpool, W-E-D-4-8-1-5-E-W, electric.";
    (async () => {
      if (!(await sleep(c, firstDelay()))) return;
      await status(c, 'in-progress');
      await say(c, 'agent', "Hi, I'm Fixie, an AI assistant. This call is recorded. Is it OK to continue, and OK to call you back on this number?");
      if (!(await sleep(c, 2000))) return;
      await say(c, 'other', "Yes, that's fine. This is Dorothy.");
      if (!(await sleep(c, 1500))) return;
      await say(c, 'other', text);
      if (!(await sleep(c, 1500))) return;
      await say(c, 'agent', 'Got it, W-E-D-4-8-1-5-E-W. Roughly when did you buy it?');
      if (!(await sleep(c, 1500))) return;
      await say(c, 'other', 'Back in 2019.');
      if (!(await sleep(c, 800))) return;
      // Bayesian diagnosis script: each reading is a record_test tool call; the reply (next test prompt or
      // the confirmation line) is spoken as the agent's next line. any_warmth uses its real outcome id 'none'.
      const diagnosisScript: Array<{ say: string; test?: string; reading?: string; ack?: string }> = [
        { say: 'Yes, the drum turns fine.', test: 'drum_spins', reading: 'yes' },
        { say: "No warmth at all, it's stone cold.", test: 'any_warmth', reading: 'none' },
        { say: "Okay, it's unplugged now.", ack: 'unplugged' },
        { say: 'The meter shows no continuity on the little fuse. It beeps nothing.', test: 'fuse_continuity', reading: 'open' },
      ];
      for (const step of diagnosisScript) {
        await say(c, 'other', step.say);
        if (!(await sleep(c, 800))) return;
        if (step.ack) await tool(c, 'safety_ack', { kind: step.ack });
        else await tool(c, 'record_test', { test: step.test, reading: step.reading });
        if (!(await sleep(c, 1500))) return;
      }
      await tool(c, 'start_job', {
        callerName: 'Dorothy',
        appliance: 'dryer',
        model: 'WED4815EW',
        symptom: opts.symptom ?? 'runs but no heat',
        purchaseYear: 2019,
        consentCallback: true,
      });
      if (!(await sleep(c, 1500))) return;
      await say(c, 'other', 'Thank you!');
      if (!(await sleep(c, 800))) return;
      await finish(c, 'customer-ended-call');
    })().catch((err) => log(`${callId} intake script error: ${(err as Error).message}`));
    return callId;
  },
};
