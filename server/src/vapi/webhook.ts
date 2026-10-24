// POST /vapi/webhook: raw Vapi JSON → contract CallEvents → orchestrator.onCallEvent(). No business logic here.
import type { Express, Request, Response } from 'express';
import { config, getEpoch, modeFor } from '../config.ts';
import type { CallCtx, CallEvent, CallRegistry, EndReason, Orchestrator, ToolName } from '../contracts.ts';
import type { Lane } from '../types.ts';

export interface WebhookDeps {
  calls: Pick<CallRegistry, 'get' | 'register'>;
  orchestrator: Pick<Orchestrator, 'onCallEvent'>;
}

const LANES: Lane[] = ['user', 'warranty', 'supplier', 'delivery', 'tech'];
const TOOL_NAMES: ToolName[] = [
  'start_job',
  'record_quote',
  'record_warranty',
  'record_order_decision',
  'install_progress',
  'safety_ack',
  'report_fix',
  'record_test',
];
const FALLBACK_RESULT = 'Sorry, one moment.';
/** Tool replies must leave in < 1 s. */
const TOOL_BUDGET_MS = 900;
const UNKNOWN_WAIT_MS = 3000;
const POLL_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** SPEC §6 endedReason → EndReason. */
export function mapEndedReason(r: string | undefined): EndReason {
  if (!r) return 'error';
  if (r === 'voicemail') return 'voicemail';
  if (r === 'customer-did-not-answer' || r === 'customer-busy' || r === 'twilio-failed-to-connect-call') return 'no_answer';
  if (r === 'exceeded-max-duration' || r === 'silence-timed-out') return 'timeout';
  if (r === 'assistant-said-end-call-phrase' || r.endsWith('-ended-call')) return 'completed';
  return 'error';
}

function callTypeOf(call: any): 'inbound' | 'outbound' | undefined {
  const t = call?.type;
  if (t === 'inboundPhoneCall' || t === 'webCall') return 'inbound';
  if (t === 'outboundPhoneCall') return 'outbound';
  return undefined;
}

export function parseArgs(a: unknown): Record<string, unknown> {
  if (a && typeof a === 'object' && !Array.isArray(a)) return a as Record<string, unknown>;
  if (typeof a === 'string' && a.trim()) {
    try {
      const v = JSON.parse(a);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }
  return {};
}

function durationOf(m: any): number {
  const d = Number(m?.durationSeconds ?? m?.call?.durationSeconds);
  if (Number.isFinite(d) && d >= 0) return d;
  const s = Date.parse(m?.startedAt ?? m?.call?.startedAt ?? '');
  const e = Date.parse(m?.endedAt ?? m?.call?.endedAt ?? '');
  if (Number.isFinite(s) && Number.isFinite(e) && e >= s) return (e - s) / 1000;
  return 0;
}

export interface ToolEntry {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

function entryOf(tc: any): ToolEntry {
  return {
    toolCallId: String(tc?.id ?? ''),
    name: String(tc?.function?.name ?? tc?.name ?? ''),
    args: parseArgs(tc?.function?.arguments ?? tc?.arguments ?? tc?.parameters),
  };
}

export function toolEntries(m: any): ToolEntry[] {
  const primary: ToolEntry[] = Array.isArray(m?.toolCallList) ? m.toolCallList.filter(Boolean).map(entryOf) : [];
  const secondary: ToolEntry[] = Array.isArray(m?.toolWithToolCallList)
    ? m.toolWithToolCallList.map((t: any) => t?.toolCall).filter(Boolean).map(entryOf)
    : [];
  if (!secondary.length) return primary;
  if (!primary.length) return secondary;
  // Both lists present: merge by id, preferring whichever entry has non-empty args.
  const byId = new Map<string, ToolEntry>();
  const order: ToolEntry[] = [];
  for (const e of primary) {
    byId.set(e.toolCallId, e);
    order.push(e);
  }
  for (const e of secondary) {
    const cur = e.toolCallId ? byId.get(e.toolCallId) : undefined;
    if (!cur) {
      if (e.toolCallId) byId.set(e.toolCallId, e);
      order.push(e);
      continue;
    }
    if (!Object.keys(cur.args).length && Object.keys(e.args).length) cur.args = e.args;
    if (!cur.name && e.name) cur.name = e.name;
  }
  return order;
}

/** Pure normalization of one Vapi `message` into CallEvents (tool events included). */
export function normalize(m: any): CallEvent[] {
  const call = m?.call ?? {};
  const callId = call?.id ? String(call.id) : '';
  if (!callId) return [];
  const fromNumber: string | undefined = call?.customer?.number || undefined;
  const callType = callTypeOf(call);
  const type = String(m?.type ?? '');

  if (type === 'tool-calls') {
    return toolEntries(m)
      .filter((t) => TOOL_NAMES.includes(t.name as ToolName))
      .map((t) => ({ kind: 'tool', callId, toolCallId: t.toolCallId, name: t.name as ToolName, args: t.args, fromNumber, callType }));
  }
  if (type === 'status-update') {
    const s = m?.status;
    const status = s === 'ringing' ? 'ringing' : s === 'in-progress' ? 'live' : s === 'ended' ? 'ended' : null;
    return status ? [{ kind: 'status', callId, status, fromNumber, callType }] : [];
  }
  if (type.startsWith('transcript')) {
    if (m?.transcriptType && m.transcriptType !== 'final') return [];
    const text = String(m?.transcript ?? '').trim();
    if (!text) return [];
    return [{ kind: 'transcript', callId, role: m?.role === 'assistant' ? 'agent' : 'other', text }];
  }
  if (type === 'end-of-call-report') {
    const endedReason = String(m?.endedReason ?? call?.endedReason ?? 'unknown');
    const transcript = m?.artifact?.transcript ?? m?.transcript;
    const cost = Number(m?.cost ?? call?.cost);
    const ev: CallEvent = { kind: 'ended', callId, reason: mapEndedReason(endedReason), endedReason, durationSec: durationOf(m) };
    if (typeof transcript === 'string' && transcript) ev.transcript = transcript;
    ev.costUsd = Number.isFinite(cost) ? cost : 0;
    return [ev];
  }
  return [];
}

/** Context hints from call.name ("jobId|vendorId|lane") and call.assistant.metadata. */
function hintsFrom(call: any): { jobId: string | null; vendorId?: string; lane?: Lane; epoch?: number; attempt?: number } | null {
  let jobId: string | null = null;
  let vendorId: string | undefined;
  let lane: Lane | undefined;
  const parts = typeof call?.name === 'string' ? call.name.split('|') : [];
  if (parts.length === 3 && LANES.includes(parts[2] as Lane)) {
    jobId = parts[0] && parts[0] !== '-' && parts[0] !== 'null' ? parts[0] : null;
    vendorId = parts[1] && parts[1] !== '-' ? parts[1] : undefined;
    lane = parts[2] as Lane;
  }
  const md = call?.assistant?.metadata ?? call?.metadata;
  if (md && typeof md === 'object') {
    if (!lane && LANES.includes(md.lane)) lane = md.lane;
    if (!jobId && typeof md.jobId === 'string' && md.jobId) jobId = md.jobId;
    if (!vendorId && typeof md.vendorId === 'string' && md.vendorId) vendorId = md.vendorId;
  }
  if (!lane) return null;
  const epoch = Number(md?.epoch);
  const attempt = Number(md?.attempt);
  return {
    jobId,
    vendorId,
    lane,
    epoch: Number.isFinite(epoch) && epoch > 0 ? epoch : undefined,
    attempt: Number.isFinite(attempt) && attempt > 0 ? attempt : undefined,
  };
}

function makeCtx(callId: string, lane: Lane, jobId: string | null, to: string, extra: Partial<CallCtx> = {}): CallCtx {
  return {
    callId,
    jobId,
    lane,
    to,
    maxSec: config.maxSec[lane],
    mode: callId.startsWith('sim_') ? 'sim' : modeFor(lane),
    epoch: getEpoch(),
    state: 'ringing',
    createdAt: Date.now(),
    quoted: false,
    attempt: 1,
    ...extra,
  };
}

export function createWebhookHandler(deps?: WebhookDeps) {
  let resolved: WebhookDeps | undefined = deps;
  const getDeps = async (): Promise<WebhookDeps> => {
    if (!resolved) {
      // Lazy import so this module (and its tests) don't drag in the whole engine at load time.
      const [{ calls }, { orchestrator }] = await Promise.all([import('../calls.ts'), import('../orchestrator.ts')]);
      resolved = { calls, orchestrator };
    }
    return resolved;
  };

  const toolCache = new Map<string, Promise<string>>();
  const chains = new Map<string, Promise<void>>();

  /** Make sure calls.get(callId) resolves: id map → wait (outbound) → call.name / metadata → inbound user ctx. */
  async function ensureCtx(d: WebhookDeps, call: any, waitMs: number): Promise<void> {
    const callId = String(call?.id ?? '');
    if (!callId || d.calls.get(callId)) return;
    const type = callTypeOf(call);
    const to = String(call?.customer?.number ?? '');
    if (type !== 'inbound') {
      // The first status-update can beat the POST /call response; give the dialer a moment to register.
      const until = Date.now() + waitMs;
      while (Date.now() < until) {
        await sleep(POLL_MS);
        if (d.calls.get(callId)) return;
      }
    }
    const h = hintsFrom(call);
    if (h?.lane) {
      d.calls.register(
        makeCtx(callId, h.lane, h.jobId, to, {
          vendorId: h.vendorId,
          ...(h.epoch ? { epoch: h.epoch } : {}),
          ...(h.attempt ? { attempt: h.attempt } : {}),
        }),
      );
      return;
    }
    if (type === 'inbound') {
      d.calls.register(makeCtx(callId, 'user', null, to));
      return;
    }
    console.warn(`[webhook] unknown call ${callId}; no context after ${waitMs} ms`);
  }

  async function runTool(d: WebhookDeps, e: Extract<CallEvent, { kind: 'tool' }>): Promise<string> {
    try {
      const r = await d.orchestrator.onCallEvent(e);
      return typeof r === 'string' && r ? r : 'OK.';
    } catch (err) {
      console.error(`[webhook] tool ${e.name} failed: ${(err as Error).message}`);
      return FALLBACK_RESULT;
    }
  }

  async function handleTools(m: any): Promise<{ results: Array<{ name: string; toolCallId: string; result: string }> }> {
    const started = Date.now();
    const entries = toolEntries(m);
    const results: Array<{ name: string; toolCallId: string; result: string }> = [];
    let d: WebhookDeps;
    try {
      d = await getDeps();
      await ensureCtx(d, m?.call, 400);
    } catch (err) {
      console.error(`[webhook] tool context failed: ${(err as Error).message}`);
      return { results: entries.map((t) => ({ name: t.name, toolCallId: t.toolCallId, result: FALLBACK_RESULT })) };
    }
    const events = normalize(m) as Array<Extract<CallEvent, { kind: 'tool' }>>;
    const promises = entries.map((t) => {
      const ev = events.find((e) => e.toolCallId === t.toolCallId);
      if (!ev) return Promise.resolve(FALLBACK_RESULT);
      const key = t.toolCallId || `${ev.callId}:${t.name}:${JSON.stringify(t.args)}`;
      let p = toolCache.get(key);
      if (!p) {
        p = runTool(d, ev);
        toolCache.set(key, p);
        if (toolCache.size > 5000) toolCache.delete(toolCache.keys().next().value as string);
      }
      return p;
    });
    const remaining = Math.max(300, TOOL_BUDGET_MS - (Date.now() - started));
    const timeout = new Promise<string>((r) => setTimeout(() => r(FALLBACK_RESULT), remaining));
    const settled = await Promise.all(promises.map((p) => Promise.race([p, timeout])));
    entries.forEach((t, i) => results.push({ name: t.name, toolCallId: t.toolCallId, result: settled[i] }));
    return { results };
  }

  /** Non-tool messages: processed in the background, in order per call. */
  function enqueue(m: any): Promise<void> {
    const callId = String(m?.call?.id ?? '');
    const events = normalize(m);
    if (!callId || events.length === 0) return Promise.resolve();
    const prev = chains.get(callId) ?? Promise.resolve();
    const next = prev
      .then(async () => {
        const d = await getDeps();
        await ensureCtx(d, m.call, UNKNOWN_WAIT_MS);
        for (const e of events) {
          try {
            await d.orchestrator.onCallEvent(e);
          } catch (err) {
            console.error(`[webhook] onCallEvent(${e.kind}) failed: ${(err as Error).message}`);
          }
        }
      })
      .catch((err) => console.error(`[webhook] ${(err as Error).message}`));
    chains.set(callId, next);
    void next.then(() => {
      if (chains.get(callId) === next) chains.delete(callId);
    });
    return next;
  }

  const handler = async (req: Request, res: Response): Promise<void> => {
    if (config.webhookSecret && req.header('x-vapi-secret') !== config.webhookSecret) {
      res.status(401).json({ error: 'bad secret' });
      return;
    }
    const m = (req.body as any)?.message;
    try {
      if (m?.type === 'tool-calls') {
        res.status(200).json(await handleTools(m));
        return;
      }
      void enqueue(m);
    } catch (err) {
      console.error(`[webhook] ${(err as Error).message}`);
    }
    if (!res.headersSent) res.status(200).json({});
  };

  /** Resolves once all queued background processing has finished (tests). */
  const idle = async () => {
    while (chains.size) await Promise.all([...chains.values()]);
  };

  return Object.assign(handler, { idle });
}

export function register(app: Express): void {
  app.post('/vapi/webhook', createWebhookHandler());
}
