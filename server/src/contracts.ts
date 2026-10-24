// FROZEN at 2:50 PM. Every workstream codes against these interfaces unchanged.
// To change one, ask Lane A (Jianan's Claude thread) first; never edit it from a workstream.
import type { Express } from 'express';
import type {
  FaultPayload,
  GuardVerdict,
  Job,
  JobState,
  Lane,
  PartInfo,
  Quote,
  RosterEntry,
} from './types.ts';

export type EndReason = 'completed' | 'voicemail' | 'no_answer' | 'timeout' | 'error';
export type Mode = 'live' | 'sim';
export type ToolName =
  | 'start_job'
  | 'record_quote'
  | 'record_warranty'
  | 'record_order_decision'
  | 'install_progress'
  | 'safety_ack'
  | 'report_fix'
  | 'record_test'
  | 'lookup_caller'
  | 'end_call'
  | 'record_knowledge';

/** Everything we know about one phone call. Registered by the dialer, or by the webhook for inbound calls. */
export interface CallCtx {
  callId: string;
  jobId: string | null;
  lane: Lane;
  vendorId?: string;
  /** E.164 destination (outbound) or caller number (inbound). Never emitted unmasked. */
  to: string;
  maxSec: number;
  mode: Mode;
  /** Demo epoch; events for an older epoch (before /demo/reset) are dropped. */
  epoch: number;
  state: 'ringing' | 'live' | 'ended';
  createdAt: number;
  liveAt?: number;
  /** True once record_quote / record_warranty has been received on this call (stuck detection). */
  quoted: boolean;
  attempt: number;
  /** Vapi monitor.controlUrl, if returned; used to end a live call. */
  controlUrl?: string;
}

/** Provider-neutral call events. webhook.ts converts raw Vapi JSON into these; sim.ts produces the same raw JSON. */
export type CallEvent =
  | {
      kind: 'tool';
      callId: string;
      toolCallId: string;
      name: ToolName;
      args: Record<string, unknown>;
      /** Caller ID from message.call.customer.number. The ONLY source for a callback number. */
      fromNumber?: string;
      callType?: 'inbound' | 'outbound';
    }
  | { kind: 'status'; callId: string; status: 'ringing' | 'live' | 'ended'; fromNumber?: string; callType?: 'inbound' | 'outbound' }
  | { kind: 'transcript'; callId: string; role: 'agent' | 'other'; text: string }
  | {
      kind: 'ended';
      callId: string;
      reason: EndReason;
      endedReason: string;
      durationSec: number;
      transcript?: string;
      costUsd?: number;
    };

/** What the orchestrator asks the dialer for. There is deliberately no `to`: the dialer resolves the destination. */
export interface CallRequest {
  lane: Lane;
  vendorId?: string;
  maxSec: number;
}

/** Input to assistants.ts. It turns this into a Vapi assistant JSON for the lane. */
export interface AssistantSpec {
  lane: Lane;
  job: Job;
  vendor?: RosterEntry;
  attempt: number;
}

/** Implemented by vapi/client.ts (live) and vapi/sim.ts (sim). */
export interface VoiceProvider {
  createCall(req: {
    to: string;
    /** "jobId|vendorId|lane", which webhook.ts can parse as a fallback context source. */
    name: string;
    spec: AssistantSpec;
    ctx: Pick<CallCtx, 'jobId' | 'lane' | 'vendorId' | 'maxSec' | 'epoch' | 'attempt'>;
  }): Promise<{ callId: string; controlUrl?: string }>;
  endCall(call: CallCtx): Promise<void>;
}

/** src/calls.ts: the call registry (owned by the engine workstream). */
export interface CallRegistry {
  register(ctx: CallCtx): void;
  get(callId: string): CallCtx | undefined;
  update(callId: string, patch: Partial<CallCtx>): CallCtx | undefined;
  forJob(jobId: string): CallCtx[];
  live(): CallCtx[];
  reset(): void;
}

/** src/jobs.ts */
export interface Jobs {
  create(init: Partial<Job> & Pick<Job, 'kind' | 'customer'>): Job;
  get(id: string): Job | undefined;
  /** Latest open (non-terminal) job for this caller number. */
  byCaller(phone: string): Job | undefined;
  all(): Job[];
  /** Synchronous compare-and-set. Returns false (and does nothing) if the job is not in `from`. Emits job_state. Snapshots. */
  transition(id: string, from: JobState | JobState[], to: JobState): boolean;
  /** Synchronous mutation plus snapshot. */
  update(id: string, mutate: (job: Job) => void): Job | undefined;
  reset(): void;
}

/** src/guards.ts: pure logic plus synchronous counter mutation. Caps come from config.caps. */
export interface Guards {
  /** Synchronous: checks AND reserves (increments counters) in one step, before any await. */
  reserve(job: Job, req: CallRequest & { to: string }): GuardVerdict;
  settle(job: Job, call: CallCtx, durationSec: number, costUsd?: number): void;
  /** Budget (landedTotal vs cap), identical-part, in-stock. null = quote OK. */
  checkQuote(job: Job, quote: Quote): GuardVerdict | null;
  /** Live calls with no quote after STUCK seconds. */
  checkStuck(job: Job, calls: CallCtx[], now: number): Array<{ callId: string; verdict: GuardVerdict }>;
  /** Agent spend cap on job.agentCostUsd. */
  checkSpend(job: Job): GuardVerdict | null;
  /** Blocks install steps at or after "restore power" until 'unplugged' and 'vent_cleared' are acked. */
  canAdvanceInstall(job: Job, step: number): GuardVerdict | null;
  /** smoke / burning / gas, etc. → pro_required (or 911 guidance). */
  safetyKeywords(text: string): GuardVerdict | null;
}

/** src/parts.ts */
export interface Parts {
  lookup(model: string, symptom: string): { appliance: string; issue: string; confidence: number; part: PartInfo } | null;
  byFault(code: string): { issue: string; confidence: number; part: PartInfo } | null;
  /** Normalizes and compares against partNumber and crossRefs. */
  isIdentical(partNumberSaid: string | undefined, part: PartInfo): boolean;
}

/** src/dialer.ts: the ONLY place that places calls. Resolves `to` from the roster or the job's caller, reserves guards, picks the provider by mode. */
export interface Dialer {
  /** Returns null when a guard refused (the guard event is already emitted). */
  placeGuardedCall(job: Job, req: CallRequest): Promise<CallCtx | null>;
  endCall(callId: string): Promise<void>;
}

/** src/orchestrator.ts */
export interface Orchestrator {
  /** Returns the tool result string for tool events (must resolve in < 1 s), undefined otherwise. Idempotent. */
  onCallEvent(e: CallEvent): Promise<string | undefined>;
  onDelivered(jobId: string): Promise<void>;
  startFault(payload: FaultPayload): Promise<Job>;
  stopJob(jobId: string, reason: string): Promise<void>;
  resetAll(): void;
}

/** Every route/webhook module exports `register(app)`; index.ts mounts it. */
export type Register = (app: Express) => void;
