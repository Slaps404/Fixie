// Reasoning layer: a stronger model coaches the fast voice model. After each final caller line it writes one
// "Coach:" note and inserts it silently into the live call. The voice model never waits for it.
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.ts';
import type { CallCtx } from './contracts.ts';
import { loadFaultTree, type DiagnosisState } from './diagnosis.ts';
import { emit } from './events.ts';

export const EXPERT_MODEL = process.env.FIXIE_EXPERT_MODEL ?? 'claude-sonnet-5-5';
const MAX_LINES = 30;
const MAX_CONSULTS = 15;
const CONSULT_TIMEOUT_MS = 8000;
const DELIVER_TIMEOUT_MS = 3000;

export type Speaker = 'caller' | 'agent';
export interface Line {
  who: Speaker;
  text: string;
}

/** What the server knows right now. Supplied lazily by the orchestrator so each consult sees the latest state. */
export interface ExpertFacts {
  lane: 'intake' | 'callback' | 'delivery';
  appliance?: string;
  model?: string;
  part?: string;
  diagnosis?: DiagnosisState;
  /** memory.ts summarize() of the caller's profile. */
  memory: string;
}

export interface ExpertModel {
  name: string;
  consult(input: { lines: Line[]; facts: ExpertFacts }, signal: AbortSignal): Promise<string>;
}

interface ExpertSession {
  lines: Line[];
  /** The consult loop currently running for this call; undefined when idle. */
  running?: Promise<void>;
  /** A caller line arrived during the running consult: run once more with the latest lines. */
  dirty: boolean;
  count: number;
  lastNote?: string;
  ctx: CallCtx;
  facts: () => ExpertFacts;
}

const SYSTEM = `You coach a phone agent who is helping an elderly caller fix a home appliance. You see the transcript and the server's facts. Output ONE line, under 45 words, exactly:
Coach: guess=<most likely cause>; fix=<plain fix>; next=<the single best next question, in plain words>; plain=<yes|no: whether to avoid jargon>
Never invent prices. For a dryer with no heat, defer to the server's diagnosis percentages. For other appliances, reason it out yourself. If the caller sounds confused, say so in next.`;

interface Ranked {
  name: string;
  p: number;
  fix?: string;
}

function ranked(d: DiagnosisState | undefined): Ranked[] {
  if (!d) return [];
  const tree = loadFaultTree(d.faultTree);
  return tree.hypotheses
    .map((h) => ({ name: h.name.toLowerCase(), p: d.posterior[h.id] ?? 0, fix: h.fix }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function renderFacts(f: ExpertFacts): string {
  const out = [`Lane: ${f.lane}.`];
  const job = [f.appliance && `appliance ${f.appliance}`, f.model && `model ${f.model}`, f.part && `part ${f.part}`].filter(Boolean);
  if (job.length) out.push(`Job: ${job.join(', ')}.`);
  const top = ranked(f.diagnosis);
  if (top.length) out.push(`Server diagnosis: ${top.map((h) => `${h.name} ${pct(h.p)}`).join(', ')}.`);
  const obs = Object.entries(f.diagnosis?.observations ?? {});
  if (obs.length) out.push(`Checks so far: ${obs.map(([t, r]) => `${t}=${r}`).join(', ')}.`);
  out.push(`Caller memory: ${f.memory}`);
  return out.join('\n');
}

export function buildExpertPrompt(lines: Line[], facts: ExpertFacts): { system: string; user: string } {
  const transcript = lines.map((l) => `${l.who === 'caller' ? 'Caller' : 'Agent'}: ${l.text}`).join('\n');
  return { system: SYSTEM, user: `${renderFacts(facts)}\n\nTranscript so far:\n${transcript || '(nothing yet)'}\n\nWrite the Coach line.` };
}

const CONFUSED = /\b(what'?s that|what is that|huh|i don'?t know|not sure|confus\w*|what do you mean|i don'?t understand)\b/i;

/** Deterministic note for DRY_RUN and keyless runs, so the board still shows the layer working. */
export function stubNote(lines: Line[], facts: ExpertFacts): string {
  const top = ranked(facts.diagnosis)[0];
  const lastCaller = [...lines].reverse().find((l) => l.who === 'caller')?.text ?? '';
  const confused = CONFUSED.test(lastCaller);
  const next = confused
    ? 'they sound confused; explain the last step by what it looks like'
    : top
      ? 'ask the next check the tool gives you'
      : 'ask what it does when they turn it on';
  const plain = confused || /Doesn't know/.test(facts.memory) ? 'yes' : 'no';
  return `Coach: guess=${top ? `${top.name} ${pct(top.p)}` : 'not clear yet'}; fix=${top?.fix?.split(';')[0] ?? 'find the cause first'}; next=${next}; plain=${plain}`;
}

export const stubExpert: ExpertModel = {
  name: 'stub',
  async consult({ lines, facts }) {
    return stubNote(lines, facts);
  },
};

function claudeExpert(apiKey: string): ExpertModel {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  return {
    name: EXPERT_MODEL,
    async consult({ lines, facts }, signal) {
      const p = buildExpertPrompt(lines, facts);
      const res = await client.messages.create(
        {
          model: EXPERT_MODEL,
          max_tokens: 160,
          system: p.system,
          messages: [{ role: 'user', content: p.user }],
          output_config: { effort: 'low' },
          // Sonnet 5.5 thinks by default; with a 160-token cap that could eat the whole line. Other models reject this value.
          ...(EXPERT_MODEL.startsWith('claude-sonnet-5-5') && { thinking: { type: 'between_tools' as const } }),
        },
        { signal, timeout: CONSULT_TIMEOUT_MS },
      );
      if (res.stop_reason === 'refusal') return '';
      for (const b of res.content) if (b.type === 'text') return b.text;
      return '';
    },
  };
}

let model: ExpertModel | null = null;
function expertModel(): ExpertModel {
  model ??= config.anthropicKey && process.env.DRY_RUN !== '1' ? claudeExpert(config.anthropicKey) : stubExpert;
  return model;
}
/** Tests inject a fake; null restores the default. */
export function setExpertModel(m: ExpertModel | null): void {
  model = m;
}

/** First non-empty line, whitespace collapsed, always "Coach:"-prefixed. Empty when the model said nothing usable. */
function cleanNote(raw: string): string {
  const line = raw.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
  if (!line) return '';
  return (/^coach:/i.test(line) ? `Coach:${line.slice(6)}` : `Coach: ${line}`).slice(0, 400);
}

/** POST a silent add-message to Vapi's live-call control URL (ClientInboundMessageAddMessage). Never throws. */
async function deliver(controlUrl: string | undefined, note: string): Promise<boolean> {
  if (!controlUrl) return false;
  try {
    const res = await fetch(controlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'add-message', message: { role: 'system', content: note }, triggerResponseEnabled: false }),
      signal: AbortSignal.timeout(DELIVER_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const sessions = new Map<string, ExpertSession>();

async function consultOnce(s: ExpertSession): Promise<void> {
  const callId = s.ctx.callId;
  const m = expertModel();
  const started = Date.now();
  let raw: string;
  try {
    raw = await m.consult({ lines: s.lines.slice(), facts: s.facts() }, AbortSignal.timeout(CONSULT_TIMEOUT_MS));
  } catch (err) {
    console.warn(`[expert] consult failed on ${callId}: ${(err as Error).message}`);
    return;
  }
  const ms = Date.now() - started;
  const note = cleanNote(raw);
  if (sessions.get(callId) !== s || !note || note === s.lastNote) return;
  s.lastNote = note;
  const delivered = await deliver(s.ctx.controlUrl, note);
  emit(s.ctx.jobId, 'note', { kind: 'expert', callId, text: note, model: m.name, ms, delivered }, { simulated: s.ctx.mode === 'sim' });
}

async function drain(s: ExpertSession): Promise<void> {
  try {
    do {
      s.dirty = false;
      if (s.count >= MAX_CONSULTS) return;
      s.count++;
      await consultOnce(s);
    } while (s.dirty && sessions.get(s.ctx.callId) === s);
  } finally {
    s.running = undefined;
  }
}

export const expert = {
  /** Record one final transcript line. Caller lines start (or queue) a consult; the returned promise settles when the queue drains. */
  onTranscript(ctx: CallCtx, who: Speaker, text: string, facts: () => ExpertFacts): Promise<void> {
    let s = sessions.get(ctx.callId);
    if (!s) {
      s = { lines: [], dirty: false, count: 0, ctx, facts };
      sessions.set(ctx.callId, s);
    }
    s.ctx = ctx;
    s.facts = facts;
    s.lines.push({ who, text });
    if (s.lines.length > MAX_LINES) s.lines.splice(0, s.lines.length - MAX_LINES);
    if (who !== 'caller' || (!s.running && s.count >= MAX_CONSULTS)) return s.running ?? Promise.resolve();
    if (s.running) {
      s.dirty = true;
      return s.running;
    }
    s.running = drain(s);
    return s.running;
  },
  end(callId: string): void {
    sessions.delete(callId);
  },
  reset(): void {
    sessions.clear();
  },
};
