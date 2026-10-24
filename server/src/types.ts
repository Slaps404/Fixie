// Shared contracts. Parallel workstreams code against these, so change them only in the foundation PR.

export type Lane = 'user' | 'warranty' | 'supplier' | 'delivery' | 'tech';

export type JobState =
  | 'NEW'
  | 'DIAGNOSED'
  | 'SOURCING'
  | 'AWAITING_CONFIRMATION'
  | 'ORDERED'
  | 'DECLINED'
  | 'DELIVERED'
  | 'INSTALLING'
  | 'FIXED'
  | 'ESCALATED'
  | 'STOPPED'
  | 'NOTIFIED';

export type SafetyLevel = 'diy' | 'diy_with_caution' | 'pro_required';

export interface PartInfo {
  partNumber: string;
  name: string;
  crossRefs: string[];
  safety: SafetyLevel;
  safetyNote: string;
  techVisitCost: number;
  rootCauseNote?: string;
  installSteps: string[];
}

export interface Quote {
  vendorId: string;
  supplier: string;
  price: number;
  shipping: number;
  /** price + shipping. Ranking and the budget cap use this, never price alone. */
  landedTotal: number;
  inStock: boolean;
  eta: string | null;
  /** Part number the supplier read back, as transcribed. */
  partNumberSaid?: string;
  /** Computed in code (parts.isIdentical), never trusted from the LLM. */
  identicalPart: boolean;
  callId: string;
  source: 'tool' | 'claude';
  /** Set when a guard rejected this quote (e.g. over budget). */
  rejectedReason?: string;
}

export interface WarrantyResult {
  covered: boolean;
  detail: string;
}

export interface CallRecord {
  callId: string;
  lane: Lane;
  vendorId?: string;
  to: string;
  startedAt: number;
  endedAt?: number;
  endedReason?: string;
  durationSec?: number;
}

export interface Job {
  id: string;
  kind: 'consumer' | 'enterprise';
  state: JobState;
  createdAt: number;
  updatedAt: number;
  customer: { name: string; phone: string };
  appliance?: string;
  model?: string;
  symptom?: string;
  purchaseYear?: number;
  part?: PartInfo;
  warranty?: WarrantyResult;
  quotes: Quote[];
  bestDeal?: Quote;
  calls: CallRecord[];
  /** vendorId -> number of calls placed, for loop detection */
  vendorCallCount: Record<string, number>;
  /** lane -> attempts, for exempt lanes (user/delivery/tech) capped at 2 */
  laneAttempts: Partial<Record<Lane, number>>;
  /** Number of guarded (warranty/supplier) calls reserved, for max_calls */
  guardedCalls: number;
  /** Minutes reserved (maxSec/60 per call), trued up on settle */
  reservedMinutes: number;
  /** Fixie's own spend (Vapi cost) in USD, summed from end-of-call reports */
  agentCostUsd: number;
  consentCallback?: boolean;
  /** Install safety acknowledgements received, e.g. 'unplugged', 'vent_cleared' */
  safetyAcks: string[];
  callbackAttempts: number;
  /** callId of the intake call that created this job */
  intakeCallId?: string;
  installStep?: number;
  /** Bayesian diagnosis state (#11): observations so far, keyed by test id. */
  diagnosis?: { faultTree: string; observations: Record<string, string>; unknowns: number; posterior: Record<string, number> };
  fault?: FaultPayload;
  notes: string[];
}

export interface FaultPayload {
  asset: string;
  code: string;
  site: string;
  techName?: string;
  techPhone?: string;
}

/** Context attached to every call we place, recovered from the callId when webhooks arrive. */
export interface CallContext {
  jobId: string;
  lane: Lane;
  vendorId?: string;
}

export interface RosterEntry {
  id: string;
  name: string;
  phone: string;
  lane: Lane;
  /** Hint used only by the dry-run simulator to script this party's replies. */
  simPersona?: string;
  /** Per-entry override of the lane mode, e.g. keep one supplier simulated while the others ring real phones. */
  mode?: 'live' | 'sim';
}

export interface Roster {
  user: RosterEntry;
  warranty: RosterEntry;
  suppliers: RosterEntry[];
  tech?: RosterEntry;
}

export type GuardKind =
  | 'budget'
  | 'max_calls'
  | 'minutes'
  | 'loop'
  | 'stuck'
  | 'voicemail'
  | 'vendor_not_approved'
  | 'safety'
  | 'no_answer'
  | 'manual'
  | 'not_identical'
  | 'out_of_stock'
  | 'agent_spend'
  | 'cosign';

export interface GuardVerdict {
  ok: boolean;
  kind?: GuardKind;
  action?: 'skipped' | 'stopped' | 'escalated';
  detail?: string;
}

export type FixieEventType =
  | 'call_started'
  | 'transcript'
  | 'call_ended'
  | 'diagnosis'
  | 'safety'
  | 'part_identified'
  | 'parts_cache'
  | 'warranty'
  | 'quote'
  | 'best_deal'
  | 'guard'
  | 'order_confirmed'
  | 'order_declined'
  | 'delivered'
  | 'install_step'
  | 'fix_verified'
  | 'fault'
  | 'job_state'
  | 'consent'
  | 'safety_ack'
  | 'metrics'
  | 'error'
  | 'diagnosis_update'
  | 'recall_check'
  | 'vision_session'
  | 'vision_capture'
  | 'vision_rank'
  | 'vision_extract'
  | 'note';

export interface FixieEvent {
  /** Monotonic sequence number; also the SSE id (Last-Event-ID). */
  id: number;
  ts: string;
  jobId: string | null;
  type: FixieEventType;
  data: Record<string, unknown>;
  /** True when the event came from a simulated (sim-mode) call. The board shows a SIMULATED badge. */
  simulated?: boolean;
}
