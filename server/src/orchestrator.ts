// WS-2: job lifecycle, ranking, timers. Consumes provider-neutral CallEvents (never raw Vapi JSON).
import { bumpEpoch, config, getEpoch, modeFor } from './config.ts';
import type { CallCtx, CallEvent, Orchestrator } from './contracts.ts';
import type { FaultPayload, FixieEventType, Job, JobState, Lane, Quote } from './types.ts';

type ApprovedBy = 'code' | 'user_voice' | 'caregiver';
import { emit, maskPhone, resetEvents } from './events.ts';
import { calls } from './calls.ts';
import { guards } from './guards.ts';
import { jobs } from './jobs.ts';
import { partByNumber, parts } from './parts.ts';
import { dialer, endCallCtx, partyName, safeRoster, simFlag } from './dialer.ts';
import { initialState, isConfident, loadFaultTree, nextTest, observe, reasonFor, topHypothesis, UNKNOWN } from './diagnosis.ts';
import type { DiagnosisState, FaultTest, FaultTree } from './diagnosis.ts';
import { getProfile, isConcept, knownFacts, knowsConcept, normalizePhone, rememberAppliance, rememberJob, rememberKnowledge, rememberNote, summarize, updateProfile } from './memory.ts';
import { sendWhatsApp, whatsappEnabled } from './notify/whatsapp.ts';
import { getOnlineQuotes, toQuote } from './commerce/online-quotes.ts';
import { placeOrder, resetOrders, revokeCards } from './commerce/place-order.ts';

const TERMINAL: JobState[] = ['FIXED', 'DECLINED', 'ESCALATED', 'STOPPED', 'NOTIFIED'];
const NON_TERMINAL: JobState[] = ['NEW', 'DIAGNOSED', 'SOURCING', 'AWAITING_CONFIRMATION', 'ORDERED', 'DELIVERED', 'INSTALLING'];
const SOURCING_LANES: Lane[] = ['warranty', 'supplier'];
const usd = (n: number) => `$${n.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- per-job runtime state ----------
const timers = new Map<string, NodeJS.Timeout[]>();
const startJobCache = new Map<string, string>(); // callId -> spoken result
const toolCache = new Map<string, Promise<string | undefined>>(); // toolCallId -> result
const endedCalls = new Set<string>();
const dialing = new Set<string>(); // jobIds whose sourcing calls are still being placed
const onlinePending = new Set<string>(); // jobIds whose web-quote lookup is still running
const stuckHandled = new Set<string>();
const savings = new Map<string, { savedVsTech: number | null; savedVsNextBest: number | null }>();
const safetyFlagged = new Set<string>(); // callIds that already tripped transcript safety
const inboundAttached = new Set<string>(); // inbound callIds attached to an existing open job (not that job's intake or callback)
const faultTriggered = new Set<string>(); // enterprise jobs whose sourcing already concluded
const guardsFired = new Map<string, number>(); // jobId -> guard events fired (#12 metrics)
const voicemailsSkipped = new Map<string, number>(); // jobId -> sourcing/other calls that hit voicemail
/** #11: diagnosis state per intake callId; the job may not exist yet when record_test first arrives. */
interface DiagEntry {
  state: DiagnosisState;
  hasMeter: boolean;
  /** Caller said (now or on an earlier call) they have no multimeter: meter tests are never offered. */
  noMeter: boolean;
  /** Caller number for customer memory (from caller ID only). */
  phone: string;
  escalated: boolean;
  escalationAnnounced: boolean;
  /** Safety acks given during intake, before any job exists (replayed onto the job at start_job). */
  acks: string[];
  /** True once start_job attached this diagnosis to a job. */
  attached: boolean;
  droppedNoted: boolean;
  /** Top hypothesis id last spoken as "Best guess so far" on this call; unchanged guesses are not repeated. */
  lastToldTop?: string;
}
/** A hypothesis whose posterior is below this is never sourced from the symptom lookup (#11). */
const LOOKUP_FLOOR = 0.2;
const diagByCall = new Map<string, DiagEntry>();
const DIAG_TREE = 'dryer_no_heat';
/** Jobs inherited from a previous process that resumeAfterRestart already picked up. */
const resumed = new Set<string>();
const PROCESS_START = Date.now();
/** A callback placed less than this long ago may still be live after a restart: wait for it instead of redialing. */
const CALLBACK_INFLIGHT_MS = 90_000;
/** Job states mirrored into the caller's memory profile. */
const REMEMBERED_STATES: JobState[] = ['ORDERED', 'FIXED', 'ESCALATED', 'DECLINED'];
const bump = (m: Map<string, number>, jobId: string) => m.set(jobId, (m.get(jobId) ?? 0) + 1);

function addTimer(jobId: string, t: NodeJS.Timeout) {
  const list = timers.get(jobId) ?? [];
  list.push(t);
  timers.set(jobId, list);
}
function clearTimers(jobId: string) {
  for (const t of timers.get(jobId) ?? []) clearTimeout(t); // clearTimeout also clears intervals in Node
  timers.delete(jobId);
}
function later(jobId: string, ms: number, fn: () => unknown) {
  addTimer(jobId, setTimeout(() => void Promise.resolve().then(fn).catch((err) => fail('timer', err, jobId)), ms));
}
function fail(where: string, err: unknown, jobId: string | null = null) {
  emit(jobId, 'error', { where, detail: ((err as Error)?.message ?? String(err)).slice(0, 300) });
}

/** CAS transition; clears the job's timers when it lands in a terminal state. */
function move(jobId: string, from: JobState | JobState[], to: JobState, reason: string, approvedBy: ApprovedBy = 'code'): boolean {
  // Same synchronous compare-and-set as jobs.transition, but the job_state event carries approvedBy + reason (#12).
  const job = jobs.get(jobId);
  const allowed = Array.isArray(from) ? from : [from];
  if (!job || !allowed.includes(job.state)) return false;
  const prev = job.state;
  jobs.update(jobId, (j) => {
    j.state = to;
  });
  emit(jobId, 'job_state', { from: prev, to, approvedBy, reason });
  if (TERMINAL.includes(to)) clearTimers(jobId);
  if (REMEMBERED_STATES.includes(to)) rememberJobState(jobId);
  return true;
}
function note(job: Job, text: string, sim = false) {
  jobs.update(job.id, (j) => j.notes.push(text));
  emit(job.id, 'note', { text }, { simulated: sim });
}
function ev(job: Job | null | undefined, type: FixieEventType, data: Record<string, unknown>, ctx?: Pick<CallCtx, 'mode'> | null) {
  return emit(job?.id ?? null, type, data, { simulated: simFlag(job, ctx) });
}
/** Every orchestrator guard event goes through here: approvedBy 'code', counted for the metrics strip. */
function guardEv(job: Job, data: Record<string, unknown>, ctx?: Pick<CallCtx, 'mode'> | null) {
  bump(guardsFired, job.id);
  return ev(job, 'guard', { approvedBy: 'code', ...data }, ctx);
}
function snapshot(job: Job) {
  jobs.update(job.id, () => {});
}
async function place(job: Job, req: Parameters<typeof dialer.placeGuardedCall>[1]) {
  const ctx = await dialer.placeGuardedCall(job, req);
  if (!ctx) bump(guardsFired, job.id); // the dialer already emitted the refusing guard event
  return ctx;
}
const sourcingCalls = (jobId: string) => calls.forJob(jobId).filter((c) => SOURCING_LANES.includes(c.lane));
const anySim = (cs: CallCtx[]) => (cs.some((c) => c.mode === 'sim') ? { mode: 'sim' as const } : null);

function speakerFor(lane: Lane, role: 'agent' | 'other'): string {
  if (role === 'agent') return 'agent';
  if (lane === 'user' || lane === 'delivery') return 'user';
  if (lane === 'tech') return 'tech';
  return 'supplier';
}
const bool = (v: unknown, dflt: boolean) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : dflt);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const numOrNaN = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : NaN);

function emitMetrics(job: Job, ctx?: Pick<CallCtx, 'mode'> | null) {
  const s = savings.get(job.id);
  const durations = job.calls.filter((c) => SOURCING_LANES.includes(c.lane) && typeof c.durationSec === 'number').map((c) => c.durationSec ?? 0);
  const serial = durations.reduce((a, b) => a + b, 0);
  const parallel = durations.reduce((a, b) => Math.max(a, b), 0);
  ev(job, 'metrics', {
    elapsedSec: Math.round((Date.now() - job.createdAt) / 1000),
    calls: job.calls.length,
    guardedCalls: job.guardedCalls,
    maxCalls: config.caps.maxCalls,
    minutes: round2(job.reservedMinutes),
    maxMinutes: config.caps.maxMinutes,
    agentCostUsd: round2(job.agentCostUsd),
    spendCap: config.spendCap,
    savedVsTech: s?.savedVsTech ?? null,
    savedVsNextBest: s?.savedVsNextBest ?? null,
    voicemailsSkipped: voicemailsSkipped.get(job.id) ?? 0,
    guardsFired: guardsFired.get(job.id) ?? 0,
    parallelMinutes: round2(parallel / 60),
    serialMinutes: round2(serial / 60),
    approvedBy: 'code',
    reason: `parallel ${round2(parallel / 60)} min (longest sourcing call) vs ${round2(serial / 60)} min if dialed one by one`,
  }, ctx);
}

// ---------- customer memory ----------
/** Caller number for memory: caller ID on the event, else the inbound call's registered number. Never tool args. */
function callerPhone(e: Extract<CallEvent, { kind: 'tool' }>): string {
  return e.fromNumber || calls.get(e.callId)?.to || '';
}
const issueOf = (job: Job) => {
  const name = job.part?.name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  if (name) return name.charAt(0).toLowerCase() + name.slice(1);
  return job.symptom || job.appliance || 'repair';
};

/** Inbound call from a customer whose job is past intake: attach the call to that job so every job tool works on it. */
function openJobFor(e: Extract<CallEvent, { kind: 'tool' }>): Job | undefined {
  const ctx = calls.get(e.callId);
  if (ctx?.jobId) return jobs.get(ctx.jobId);
  if (ctx && ctx.lane !== 'user') return undefined;
  const phone = callerPhone(e);
  const job = phone ? jobs.byCaller(phone) : undefined;
  if (!job || job.kind !== 'consumer' || ['NEW', 'DIAGNOSED'].includes(job.state)) return undefined;
  ensureInboundCtx(e.callId, phone, job.id);
  inboundAttached.add(e.callId);
  if (!job.calls.some((c) => c.callId === e.callId)) {
    jobs.update(job.id, (j) => j.calls.push({ callId: e.callId, lane: 'user', to: phone, startedAt: Date.now() }));
  }
  return jobs.get(job.id);
}

/** One line for the agent: where the open job stands and what it can do about it right now, on this call. */
function statusLine(job: Job): string {
  const part = job.part?.name ?? 'the part';
  const steps = job.part?.installSteps?.length ?? 0;
  const deal = job.bestDeal;
  switch (job.state) {
    case 'SOURCING':
      return `Open job: ${job.appliance ?? 'repair'}, ${part}. Still calling suppliers and the warranty line; you'll call them back with the best price within minutes.`;
    case 'AWAITING_CONFIRMATION':
      return deal
        ? `Open job: best price for ${part} is ${usd(deal.landedTotal)} with shipping, arriving ${deal.eta ?? 'in a few days'}. Tell them the price, and if they say order it, call record_order_decision now.`
        : `Open job: ${part}; no in-stock offer within budget yet.`;
    case 'ORDERED':
      return `Open job: ${part} was ordered${deal?.eta ? `, arriving ${deal.eta}` : ''}. If they say it arrived, call mark_delivered and walk them through the ${steps}-step install on this call.`;
    case 'DELIVERED':
    case 'INSTALLING':
      return `Open job: ${part} has arrived. Install is at step ${job.installStep ?? 0} of ${steps}. Offer to walk them through it now: safety_ack unplugged and vent_cleared first, then install_progress.`;
    default:
      return `Open job: ${job.state.toLowerCase().replace(/_/g, ' ')}.`;
  }
}

function handleLookupCaller(e: Extract<CallEvent, { kind: 'tool' }>): string {
  const phone = callerPhone(e);
  const profile = phone ? getProfile(phone) : undefined;
  const open = openJobFor(e);
  const out = `${summarize(profile)}${open ? ` ${statusLine(open)}` : ''}`;
  const known = knownFacts(profile);
  if (profile?.name) known.unshift(`name: ${profile.name}`);
  for (const a of profile?.appliances ?? []) known.push(`appliance: ${a.appliance} ${a.model}${a.purchaseYear ? ` (${a.purchaseYear})` : ''}`.trim());
  const returning = out !== 'New caller.';
  if (open) known.push(`open job ${open.id} (${open.state})`);
  const ctx = calls.get(e.callId) ?? (e.callId.startsWith('sim') ? { mode: 'sim' as const } : null);
  emit(null, 'note', {
    kind: 'memory_lookup',
    callId: e.callId,
    phone: maskPhone(phone),
    returning,
    known,
    text: returning ? `Caller ${maskPhone(phone)} is a returning customer${profile?.name ? ` (${profile.name})` : ''}: ${known.join('; ') || 'no facts yet'}.` : `Caller ${maskPhone(phone) || '(no caller ID)'} is new: nothing on file.`,
  }, { simulated: ctx?.mode === 'sim' });
  return out;
}

function handleRecordKnowledge(e: Extract<CallEvent, { kind: 'tool' }>): string {
  const concept = e.args.concept;
  if (!isConcept(concept)) return 'Noted.';
  const knows = bool(e.args.knows, false);
  const phone = callerPhone(e);
  if (phone) updateProfile(phone, (p) => rememberKnowledge(p, concept, knows));
  const ctx = calls.get(e.callId) ?? (e.callId.startsWith('sim') ? { mode: 'sim' as const } : null);
  const word = concept.replace(/_/g, ' ');
  emit(null, 'note', {
    kind: 'memory_update',
    field: `knows.${concept}`,
    value: knows,
    callId: e.callId,
    text: knows ? `Caller knows what a ${word} is (remembered).` : `Caller does not know what a ${word} is (remembered; plain words from now on).`,
  }, { simulated: ctx?.mode === 'sim' });
  return 'Noted.';
}

/** After start_job: upsert the caller's name, appliance and a job entry. Idempotent per jobId. */
function rememberStartJob(e: Extract<CallEvent, { kind: 'tool' }>): void {
  const jobId = calls.get(e.callId)?.jobId;
  const job = jobId ? jobs.get(jobId) : undefined;
  if (!job || job.kind !== 'consumer') return;
  const name = str(e.args.callerName);
  updateProfile(callerPhone(e) || job.customer.phone, (p) => {
    if (name) p.name = name;
    if (job.model) rememberAppliance(p, { appliance: job.appliance ?? str(e.args.appliance), model: job.model, purchaseYear: job.purchaseYear });
    rememberJob(p, { jobId: job.id, issue: issueOf(job), state: job.state });
  });
}

function rememberJobState(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job || job.kind !== 'consumer' || !getProfile(job.customer.phone)?.jobs.some((j) => j.jobId === jobId)) return;
  updateProfile(job.customer.phone, (p) => rememberJob(p, { jobId, issue: issueOf(job), state: job.state }));
}

/** has_meter answers: only a clear yes counts as owning one; "no", "unknown", "what's that?" all mean no. */
const meterYes = (reading: string) => /^(y|yes|yeah|yep|true|have|has|has one|owns?)\b/i.test(reading.trim());

function rememberMeter(entry: DiagEntry, hasMeter: boolean): void {
  entry.hasMeter = hasMeter;
  entry.noMeter = !hasMeter;
  if (entry.phone && getProfile(entry.phone)?.hasMeter !== hasMeter) updateProfile(entry.phone, (p) => (p.hasMeter = hasMeter));
}

function newDiagEntry(e: Extract<CallEvent, { kind: 'tool' }>, job: Job | undefined, tree: FaultTree): DiagEntry {
  const phone = callerPhone(e) || job?.customer.phone || '';
  const known = phone ? getProfile(phone)?.hasMeter : undefined;
  return {
    state: job?.diagnosis ? { ...job.diagnosis } : initialState(tree),
    hasMeter: known === true,
    noMeter: known === false,
    phone: normalizePhone(phone),
    escalated: false,
    escalationAnnounced: false,
    acks: [...(job?.safetyAcks ?? [])],
    attached: !!job,
    droppedNoted: false,
  };
}

// ---------- intake ----------
function ensureInboundCtx(callId: string, fromNumber: string | undefined, jobId: string | null): CallCtx {
  const existing = calls.get(callId);
  if (existing) {
    if (jobId && !existing.jobId) return calls.update(callId, { jobId }) ?? existing;
    return existing;
  }
  const ctx: CallCtx = {
    callId,
    jobId,
    lane: 'user',
    to: fromNumber ?? '',
    maxSec: config.maxSec.user,
    mode: callId.startsWith('sim') ? 'sim' : modeFor('user'),
    epoch: getEpoch(),
    state: 'live',
    createdAt: Date.now(),
    liveAt: Date.now(),
    quoted: false,
    attempt: 1,
  };
  calls.register(ctx);
  return ctx;
}

function firstSentence(s: string): string {
  const m = s.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : s).trim();
}

function handleStartJob(e: Extract<CallEvent, { kind: 'tool' }>): string {
  const cached = startJobCache.get(e.callId);
  if (cached) return cached;
  const a = e.args;
  const roster = safeRoster();
  let phone = e.fromNumber;
  let usedFallback = false;
  if (!phone) {
    phone = roster?.user.phone ?? '';
    usedFallback = true;
  }
  const sim0 = e.callId.startsWith('sim') ? { mode: 'sim' as const } : calls.get(e.callId) ?? null;
  const consentCallback = bool(a.consentCallback, true);
  const model = str(a.model);
  const symptom = str(a.symptom);
  const purchaseYear = Number(a.purchaseYear) || undefined;

  // The voice model sometimes fires start_job with no arguments, then retries with them. Answering that first call
  // with a cached escalation dead-ended real calls, so with nothing to go on, create nothing and ask for a retry.
  const hasEvidence = Object.keys(diagByCall.get(e.callId)?.state.observations ?? {}).length > 0;
  if (!model && !getProfile(phone)?.appliances?.at(-1)?.model && !hasEvidence) {
    return 'Missing the model number. If you have it, call start_job again with appliance, model, and symptom; otherwise ask them for it first.';
  }

  let job = phone ? jobs.byCaller(phone) : undefined;
  if (job && !['NEW', 'DIAGNOSED'].includes(job.state)) {
    // Caller already has a job in flight: resume it, don't start a second one.
    const ctx = ensureInboundCtx(e.callId, phone, job.id);
    inboundAttached.add(e.callId);
    const out = `No new job: this caller already has one. ${statusLine(job)}`;
    ev(job, 'note', { text: `Caller ${maskPhone(phone)} resumed ${job.id} (${job.state}).` }, ctx);
    startJobCache.set(e.callId, out);
    return out;
  }
  if (!job) {
    job = jobs.create({
      kind: 'consumer',
      customer: { name: str(a.callerName) || roster?.user.name || 'Caller', phone },
      appliance: str(a.appliance) || undefined,
      model: model || undefined,
      symptom: symptom || undefined,
      consentCallback,
      purchaseYear,
      intakeCallId: e.callId,
    });
  } else {
    jobs.update(job.id, (j) => {
      j.intakeCallId = e.callId;
      j.consentCallback = consentCallback;
      if (model) j.model = model;
      if (symptom) j.symptom = symptom;
      if (purchaseYear) j.purchaseYear = purchaseYear;
      if (str(a.appliance)) j.appliance = str(a.appliance);
    });
  }
  const jobId = job.id;
  const diag = diagByCall.get(e.callId);
  if (diag) {
    diag.attached = true;
    mirrorDiagnosis(jobId, diag.state);
    const fresh = diag.acks.filter((k) => !(jobs.get(jobId)?.safetyAcks ?? []).includes(k));
    if (fresh.length) jobs.update(jobId, (j) => j.safetyAcks.push(...fresh));
  }
  const ctx = ensureInboundCtx(e.callId, phone, jobId);
  if (!job.calls.some((c) => c.callId === e.callId)) {
    jobs.update(jobId, (j) => j.calls.push({ callId: e.callId, lane: 'user', to: phone ?? '', startedAt: ctx.createdAt }));
  }
  const sim = ctx ?? sim0;
  if (usedFallback) note(job, 'No caller ID on the intake call; using the roster user number (demo only).', simFlag(job, sim));

  ev(job, 'consent', { callback: consentCallback, callId: e.callId }, sim);
  for (const kind of diag?.acks ?? []) ev(job, 'safety_ack', { kind, callId: e.callId, phase: 'intake', approvedBy: 'caller' }, sim);

  if (diag?.escalated) {
    const why = `Diagnosis stopped: ${diag.state.unknowns} unclear readings. A licensed pro should check this.`;
    ev(job, 'safety', { level: 'pro_required', reason: why, source: 'diagnosis', approvedBy: 'code' }, sim);
    note(job, why, simFlag(job, sim));
    move(jobId, ['NEW', 'DIAGNOSED'], 'ESCALATED', `diagnosis: ${diag.state.unknowns} unclear readings, so no part is bought; escalated to a pro`);
    const out = `Since we couldn't get a clear reading, I don't want to guess. I've flagged this for a licensed pro to call you back on this number.`;
    startJobCache.set(e.callId, out);
    return out;
  }

  // The voice model sometimes calls start_job with empty args. Fall back to what we already know instead of escalating:
  // the caller's remembered appliance, then the part named by the diagnosis evidence gathered on this call.
  const remembered = getProfile(phone)?.appliances?.at(-1);
  let hit = parts.lookup(model || remembered?.model || '', symptom || job.symptom || 'no heat');
  if (!hit && diag && Object.keys(diag.state.observations).length > 0) {
    const tree = loadFaultTree(diag.state.faultTree);
    const top = topHypothesis(diag.state);
    const hyp = tree.hypotheses.find((h) => h.id === top.id);
    const part = partByNumber(hyp?.partNumber);
    if (part && hyp) {
      hit = { appliance: tree.appliance, issue: hyp.name, confidence: Math.round(top.p * 100) / 100, part };
      note(job, `start_job arrived without a model; used the diagnosis lead (${hyp.name}, P=${hit.confidence}).`, simFlag(job, sim));
    }
  }
  const danger = guards.safetyKeywords(`${symptom} ${str(a.appliance)} ${model}`);

  if (!hit) {
    ev(job, 'diagnosis', { appliance: str(a.appliance) || 'appliance', model, issue: 'Unknown: model not in the seeded catalog', confidence: 0, label: 'lookup prior' }, sim);
    if (danger) ev(job, 'safety', { level: 'pro_required', reason: danger.detail }, sim);
    note(job, `No catalog match for model "${model}" / "${symptom}". Escalated to a human.`, simFlag(job, sim));
    move(jobId, ['NEW', 'DIAGNOSED'], 'ESCALATED', `no catalog match for model "${model}" / "${symptom}": escalated to a human`);
    const out = danger
      ? `${danger.detail?.split('.')[0] ?? 'Please stop using it'}. I've flagged this for a licensed technician to call you back.`
      : `I couldn't match that model in my catalog, so I've flagged it for a technician to call you back on this number.`;
    startJobCache.set(e.callId, out);
    return out;
  }

  // #11: with test evidence, the confirmed top hypothesis decides the part; otherwise the symptom lookup does.
  let confirmed: { name: string; partNumber: string; p: number } | null = null;
  let partSource = 'symptom lookup';
  let unconfirmedLead = false;
  if (diag && Object.keys(diag.state.observations).length > 0) {
    const tree = loadFaultTree(diag.state.faultTree);
    const top = topHypothesis(diag.state);
    const hyp = tree.hypotheses.find((h) => h.id === top.id);
    if (hyp && isConfident(diag.state)) {
      if (hyp.partNumber && parts.isIdentical(hyp.partNumber, hit.part)) {
        confirmed = { name: hyp.name.toLowerCase(), partNumber: hit.part.partNumber, p: top.p };
        partSource = `diagnosis confirmed ${hyp.name} (P ${top.p.toFixed(2)})`;
      } else if (!hyp.partNumber) {
        const why = `Tests point to the ${hyp.name.toLowerCase()} (P ${top.p.toFixed(2)}), which is not a DIY catalog part. A licensed pro should handle it.`;
        ev(job, 'diagnosis', { appliance: hit.appliance, model, issue: hyp.name, confidence: top.p, label: 'bayesian' }, sim);
        ev(job, 'safety', { level: 'pro_required', reason: why, source: 'diagnosis', approvedBy: 'code' }, sim);
        note(job, why, simFlag(job, sim));
        move(jobId, ['NEW', 'DIAGNOSED'], 'ESCALATED', `diagnosis confirmed ${hyp.name} (P ${top.p.toFixed(2)}): no catalog part, escalated to a pro`);
        const out = `The tests point to the ${hyp.name.toLowerCase()}, and that's a job for a licensed pro. I've flagged it for a technician to call you back on this number.`;
        startJobCache.set(e.callId, out);
        return out;
      } else {
        const why = `Tests confirm the ${hyp.name.toLowerCase()} (P ${top.p.toFixed(2)}) but the catalog part for this model (${hit.part.partNumber}) is a different part. No part is bought; a licensed pro should check this.`;
        ev(job, 'diagnosis', { appliance: hit.appliance, model, issue: hyp.name, confidence: top.p, label: 'bayesian' }, sim);
        ev(job, 'safety', { level: 'pro_required', reason: why, source: 'diagnosis', approvedBy: 'code' }, sim);
        note(job, why, simFlag(job, sim));
        move(jobId, ['NEW', 'DIAGNOSED'], 'ESCALATED', `diagnosis confirmed ${hyp.name} but the catalog part differs: escalated to a pro, nothing sourced`);
        const out = `The tests point to the ${hyp.name.toLowerCase()}, but I can't match the right part for your model. I've flagged it for a licensed pro to call you back${consentCallback ? ' on this number' : ''}.`;
        startJobCache.set(e.callId, out);
        return out;
      }
    } else {
      // Not confident. The symptom lookup may stand in only if the readings still favor ITS part as the top cause.
      const lookupHyp = tree.hypotheses.find((h) => h.partNumber && parts.isIdentical(h.partNumber, hit.part));
      const lookupP = lookupHyp ? diag.state.posterior[lookupHyp.id] ?? 0 : 0;
      if (lookupHyp && top.id === lookupHyp.id && lookupP >= LOOKUP_FLOOR) {
        note(job, `Diagnosis not confirmed (top: ${hyp?.name ?? 'none'}, P ${top.p.toFixed(2)}); the readings still favor the lookup part, so it is sourced as unconfirmed.`, simFlag(job, sim));
        unconfirmedLead = true;
      } else {
        const why = `Tests do not confirm a DIY part: top cause ${hyp?.name.toLowerCase() ?? 'unknown'} (P ${top.p.toFixed(2)}), and the symptom-lookup part ${hit.part.partNumber} is ${lookupHyp ? `${lookupHyp.name.toLowerCase()}, P ${lookupP.toFixed(2)}` : 'not covered by these tests'}. No part is bought; a licensed pro should check this.`;
        ev(job, 'diagnosis', { appliance: hit.appliance, model, issue: hyp?.name ?? 'Unconfirmed', confidence: top.p, label: 'bayesian' }, sim);
        ev(job, 'safety', { level: 'pro_required', reason: why, source: 'diagnosis', approvedBy: 'code' }, sim);
        note(job, why, simFlag(job, sim));
        move(jobId, ['NEW', 'DIAGNOSED'], 'ESCALATED', `diagnosis unconfirmed (top ${hyp?.name ?? 'none'} P ${top.p.toFixed(2)}) and the lookup part is argued against: escalated to a pro, nothing sourced`);
        const out = `The tests don't point clearly to one part, and I don't want to order the wrong one. I've flagged this for a licensed pro to call you back${consentCallback ? ' on this number' : ''}.`;
        startJobCache.set(e.callId, out);
        return out;
      }
    }
  }

  jobs.update(jobId, (j) => {
    j.part = hit.part;
    j.appliance = hit.appliance;
  });
  if (confirmed) ev(job, 'diagnosis', { appliance: hit.appliance, model, issue: confirmed.name, confidence: confirmed.p, label: 'bayesian' }, sim);
  else if (unconfirmedLead && diag) ev(job, 'diagnosis', { appliance: hit.appliance, model, issue: hit.issue, confidence: topHypothesis(diag.state).p, label: 'bayesian' }, sim);
  else ev(job, 'diagnosis', { appliance: hit.appliance, model, issue: hit.issue, confidence: hit.confidence, label: 'lookup prior' }, sim);
  const level = danger ? 'pro_required' : hit.part.safety;
  ev(job, 'safety', { level, reason: danger?.detail ?? hit.part.safetyNote }, sim);
  ev(job, 'part_identified', { part: hit.part.name, partNumber: hit.part.partNumber, crossRefs: hit.part.crossRefs }, sim);

  let out: string;
  if (danger) {
    note(job, `Safety keyword in symptom: ${danger.detail}`, simFlag(job, sim));
    move(jobId, ['NEW', 'DIAGNOSED'], 'ESCALATED', `safety rule: ${danger.detail ?? 'safety keyword in symptom'}`);
    out = /911/.test(danger.detail ?? '')
      ? `Please leave the house now and call 911 if you smell gas or see smoke. This needs a licensed pro, so I've flagged it and I won't walk you through a repair.`
      : `Please unplug it and stop using it; this needs a licensed pro. I've flagged it for a technician to call you back.`;
    startJobCache.set(e.callId, out);
    return out;
  }

  move(jobId, 'NEW', 'DIAGNOSED', `${partSource}; safety level ${level}`);
  later(jobId, config.caps.sourcingFallbackSeconds * 1000, () => startSourcing(jobId));
  const back = consentCallback ? ' on this number' : '';
  if (hit.part.safety === 'pro_required') {
    const lead = confirmed ? `That confirms it: the ${confirmed.name}, part ${hit.part.partNumber}` : `Most likely it's a ${hit.issue.toLowerCase()}, part ${hit.part.partNumber}`;
    out = `${lead}, and that's a job for a licensed pro, not DIY. I'll check your warranty and price the part, then call you back${back}.`;
  } else {
    const vent = hit.part.rootCauseNote ? firstSentence(hit.part.rootCauseNote).replace(/[.!?]$/, '') : '';
    const ventClause = vent ? `; ${vent.charAt(0).toLowerCase()}${vent.slice(1)}, so we'll clean that too` : '';
    const lead = confirmed ? `That confirms it: the ${confirmed.name}, part ${hit.part.partNumber}` : `Most likely it's a ${hit.issue.toLowerCase()}, part ${hit.part.partNumber}`;
    out = `${lead}${ventClause}. I'll check your warranty and call parts suppliers now, then call you back${back}.`;
  }
  startJobCache.set(e.callId, out);
  return out;
}

// ---------- diagnosis (#11) ----------
function mirrorDiagnosis(jobId: string, state: DiagnosisState) {
  jobs.update(jobId, (j) => {
    j.diagnosis = { faultTree: state.faultTree, observations: { ...state.observations }, unknowns: state.unknowns, posterior: { ...state.posterior } };
  });
}

const ACK_PHRASE: Record<string, string> = { unplugged: 'it is unplugged from the wall', vent_cleared: 'the vent is cleared' };

/**
 * Next instruction after a reading. Callers with a meter go straight to the highest-value meter test;
 * everyone else gets the no-tool questions first, with meter tests offered once those are used up.
 * Only acks actually given (safety_ack during intake) count; a blocked meter test comes back as an ask-to-unplug.
 */
function nextInstruction(entry: DiagEntry, fullTree: FaultTree): { test: FaultTest | null; text: string } {
  const profile = entry.phone ? getProfile(entry.phone) : undefined;
  const tree = { ...fullTree, tests: fullTree.tests.filter((t) => !(isConcept(t.concept) && knowsConcept(profile, t.concept) === false)) };
  const allAcks = [...new Set(tree.tests.flatMap((t) => t.requiresAck))];
  const pick = (hasMeter: boolean, meterOnly: boolean): { test: FaultTest; blocked: string[] } | null => {
    const scoped = meterOnly ? { ...tree, tests: tree.tests.filter((t) => t.needsMeter) } : tree;
    const ok = nextTest(entry.state, scoped, { acks: entry.acks, hasMeter });
    if (ok) return { test: ok, blocked: [] };
    const hypo = nextTest(entry.state, scoped, { acks: allAcks, hasMeter });
    return hypo ? { test: hypo, blocked: hypo.requiresAck.filter((k) => !entry.acks.includes(k)) } : null;
  };
  const say = (r: { test: FaultTest; blocked: string[] }, prefix = '') => {
    const gate = r.blocked.length
      ? `First ask them to confirm ${r.blocked.map((k) => ACK_PHRASE[k] ?? k).join(' and ')}, and call safety_ack for each. Only then ask: `
      : '';
    return { test: r.test, text: `${prefix}${gate}${r.test.prompt}` };
  };
  if (entry.noMeter) {
    const plain = pick(false, false);
    return plain ? say(plain) : { test: null, text: '' };
  }
  if (entry.hasMeter) {
    const m = pick(true, true);
    if (m) return say(m);
    const any = pick(true, false);
    return any ? say(any) : { test: null, text: '' };
  }
  const plain = pick(false, false);
  if (plain && plain.blocked.length === 0) return say(plain);
  const m = pick(true, true);
  return m ? say(m, 'If they have a multimeter: ') : { test: null, text: '' };
}

function handleRecordTest(e: Extract<CallEvent, { kind: 'tool' }>): string {
  const ctx = calls.get(e.callId);
  if (ctx && ctx.epoch !== getEpoch()) return 'Okay.';
  const job = ctx?.jobId ? jobs.get(ctx.jobId) : undefined;
  if (job && (job.state === 'STOPPED' || job.state === 'ESCALATED')) return 'This request has been closed. Thank them and end the call.';
  const sim = ctx ?? (e.callId.startsWith('sim') ? { mode: 'sim' as const } : null);
  const tree = loadFaultTree(DIAG_TREE);
  let entry = diagByCall.get(e.callId);
  if (!entry) {
    entry = newDiagEntry(e, job, tree);
    diagByCall.set(e.callId, entry);
  }
  for (const k of job?.safetyAcks ?? []) if (!entry.acks.includes(k)) entry.acks.push(k);
  // Optional: the model says up front whether the caller owns a multimeter, so we skip the walk-to-the-breaker-box detour.
  const meterArg = e.args.has_meter ?? e.args.hasMeter;
  if (meterArg !== undefined && meterArg !== '') rememberMeter(entry, bool(meterArg, entry.hasMeter));

  const testId = str(e.args.test);
  const reading = str(e.args.reading);
  if (testId === 'has_meter') {
    // A fact about the caller, not evidence: no observation, no unknown, no posterior change.
    const has = meterYes(reading);
    rememberMeter(entry, has);
    if (!has && entry.phone && /unknown|don'?t know|do not know|what'?s that|what is/i.test(reading)) {
      updateProfile(entry.phone, (p) => rememberKnowledge(p, 'multimeter', false));
    }
    ev(job ?? null, 'note', { kind: 'memory_update', field: 'hasMeter', value: has, callId: e.callId, text: has ? 'Caller has a multimeter (remembered).' : 'Caller has no multimeter (remembered; meter tests skipped from now on).' }, sim);
    if (entry.escalated) return 'Noted. Testing has stopped; call start_job so it is logged.';
    const nxt = nextInstruction(entry, tree);
    return nxt.test ? `Noted. Next, ask them: ${nxt.text}` : 'Noted. Call start_job with what you know.';
  }
  if (entry.escalated) return 'Testing has stopped. Tell them a licensed pro should take a look, then call start_job so it is logged.';
  const test = tree.tests.find((t) => t.id === testId);
  if (!test) {
    const nxt = nextInstruction(entry, tree);
    return `I don't have a test called "${testId}".${nxt.text ? ` Ask them: ${nxt.text}` : ' Call start_job with what you know.'}`;
  }
  const prev = entry.state;
  const state = observe(prev, tree, test, reading);
  const outcome = state.observations[test.id] ?? UNKNOWN;
  if (test.needsMeter && outcome !== UNKNOWN) {
    rememberMeter(entry, true);
    if (!test.requiresAck.every((k) => entry.acks.includes(k))) {
      ev(job ?? null, 'note', { text: `${test.label} meter reading arrived without a recorded ${test.requiresAck.filter((k) => !entry.acks.includes(k)).join(' + ')} acknowledgement.` }, sim);
    }
  }
  entry.state = state;
  if (job) mirrorDiagnosis(job.id, state);

  const top = topHypothesis(state);
  const confident = isConfident(state);
  const escalate = !confident && state.unknowns >= 2;
  const nxt = confident || escalate ? { test: null, text: '' } : nextInstruction(entry, tree);
  ev(job ?? null, 'diagnosis_update', {
    test: test.id,
    reading: outcome,
    posterior: { ...state.posterior },
    top: top.id,
    topProb: top.p,
    next: nxt.test?.id ?? null,
    reason: reasonFor(prev, state, test, reading),
    approvedBy: 'code',
  }, sim);

  const hypName = (id: string) => tree.hypotheses.find((h) => h.id === id)?.name.toLowerCase() ?? id.replace(/_/g, ' ');
  if (escalate) {
    entry.escalated = true;
    const why = `Diagnosis stopped: ${state.unknowns} unclear readings (top guess ${hypName(top.id)}, P ${top.p.toFixed(2)}). A licensed pro should check this.`;
    ev(job ?? null, 'safety', { level: 'pro_required', reason: why, source: 'diagnosis', approvedBy: 'code' }, sim);
    if (job) {
      note(job, why, simFlag(job, sim));
      move(job.id, NON_TERMINAL, 'ESCALATED', `diagnosis: ${state.unknowns} unclear readings; testing stopped, escalated to a pro`);
    }
    return `That reading was unclear again, so we'll stop testing. Tell them a licensed pro should take a look and I'll flag it, then call start_job so it is logged.`;
  }
  const topHyp = tree.hypotheses.find((h) => h.id === top.id);
  const fixSentence = topHyp?.fix ? ` The fix is ${topHyp.fix}.` : '';
  if (confident) return `That confirms it: the ${hypName(top.id)}.${fixSentence} Now call start_job.`;
  const unclear = outcome === UNKNOWN ? `I couldn't use that reading (${state.unknowns} unclear so far). ` : '';
  if (nxt.test) {
    let guess = '';
    if (entry.lastToldTop !== top.id) {
      entry.lastToldTop = top.id;
      guess = `Best guess so far: ${hypName(top.id)} (${Math.round(top.p * 100)}%)${topHyp?.fix ? `, fix: ${topHyp.fix}` : ''}. `;
    }
    return `${unclear}${guess}Next, ask them: ${nxt.text}`;
  }
  if (topHyp?.partNumber) return `${unclear}No further safe tests are available. Call start_job and say the most likely cause is the ${hypName(top.id)}, unconfirmed.${fixSentence}`;
  return `${unclear}No further safe tests are available, and the readings do not point to a part we can order (best guess: ${hypName(top.id)}, P ${top.p.toFixed(2)}). Tell them a licensed pro should take a look, then call start_job so it is logged. Do not name a part.`;
}

// ---------- sourcing ----------
async function startSourcing(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;
  if (!move(jobId, 'DIAGNOSED', 'SOURCING', 'intake call ended: sourcing starts (warranty + roster suppliers only)')) return;
  clearTimers(jobId); // drop the sourcing fallback timer
  const roster = safeRoster();
  const plan: Array<{ lane: Lane; vendorId?: string }> = [];
  if (job.kind === 'consumer' && roster?.warranty) plan.push({ lane: 'warranty', vendorId: roster.warranty.id });
  for (const s of roster?.suppliers ?? []) plan.push({ lane: 'supplier', vendorId: s.id });
  if (job.kind === 'consumer') startOnlineQuotes(jobId);

  later(jobId, config.caps.sourcingTimeoutSeconds * 1000, () => evaluateCallback(jobId, true));
  addTimer(jobId, setInterval(() => {
    try {
      runStuckCheck(jobId);
    } catch (err) {
      fail('checkStuck', err, jobId);
    }
  }, 5000));

  dialing.add(jobId);
  try {
    const placed: Array<Promise<unknown>> = [];
    for (let i = 0; i < plan.length; i++) {
      const cur = jobs.get(jobId);
      if (!cur || cur.state !== 'SOURCING') break;
      const p = plan[i];
      placed.push(place(cur, { lane: p.lane, vendorId: p.vendorId, maxSec: config.maxSec[p.lane] }).catch((err) => fail('placeGuardedCall', err, jobId)));
      if (i < plan.length - 1) await new Promise((r) => setTimeout(r, 300));
    }
    await Promise.all(placed);
  } finally {
    dialing.delete(jobId);
  }
  evaluateCallback(jobId, false);
}

/** Web lane, in parallel with the phone calls: web quotes join job.quotes and rank with phone quotes on landed total. */
function startOnlineQuotes(jobId: string) {
  const job = jobs.get(jobId);
  if (!job?.part || process.env.ONLINE_QUOTES === 'off') return;
  onlinePending.add(jobId);
  void getOnlineQuotes(job.part, { timeoutMs: Math.max(10, config.caps.sourcingTimeoutSeconds - 15) * 1000 })
    .then(({ quotes, freshness, error }) => {
      const cur = jobs.get(jobId);
      if (!cur || cur.state !== 'SOURCING') return;
      const found = quotes.map(toQuote).map((q) => {
        const v = guards.checkQuote(cur, q);
        if (v && !v.ok) q.rejectedReason = v.detail ?? 'Rejected by guard';
        return q;
      });
      jobs.update(jobId, (j) => j.quotes.push(...found));
      const usable = found.filter((q) => !q.rejectedReason);
      const stores = new Set(quotes.map((q) => q.merchant)).size;
      ev(cur, 'online_quotes', {
        count: quotes.length, stores, usable: usable.length, freshness, ...(error ? { error } : {}),
        best: usable[0] ? { supplier: usable[0].supplier, landedTotal: usable[0].landedTotal, url: usable[0].url } : null,
        approvedBy: 'code',
        reason: `Checked ${stores} web stores (${freshness === 'live' ? 'live prices' : 'cached prices'}); ${usable.length} identical, in stock, under budget`,
      }, null);
      for (const q of usable.filter((q, i, a) => a.findIndex((x) => x.supplier === q.supplier) === i).slice(0, 4)) {
        ev(cur, 'quote', {
          supplier: q.supplier, vendorId: q.vendorId, price: q.price, shipping: q.shipping, landedTotal: q.landedTotal,
          inStock: q.inStock, eta: q.eta, partNumberSaid: q.partNumberSaid, identicalPart: q.identicalPart, rejected: false,
          source: 'online', freshness, url: q.url, approvedBy: 'code',
          reason: `${q.supplier} web listing: ${usd(q.landedTotal)} landed, identical part, in stock (${freshness}).`,
        }, null);
      }
    })
    .catch((err) => fail('onlineQuotes', err, jobId))
    .finally(() => {
      onlinePending.delete(jobId);
      evaluateCallback(jobId, false);
    });
}

function runStuckCheck(jobId: string) {
  const job = jobs.get(jobId);
  if (!job || job.state !== 'SOURCING') return;
  const live = sourcingCalls(jobId).filter((c) => c.state !== 'ended');
  for (const { callId, verdict } of guards.checkStuck(job, live, Date.now())) {
    if (stuckHandled.has(callId)) continue;
    stuckHandled.add(callId);
    const ctx = calls.get(callId);
    guardEv(job, { kind: verdict.kind ?? 'stuck', action: verdict.action ?? 'skipped', reason: verdict.detail, detail: verdict.detail, callId }, ctx);
    void dialer.endCall(callId);
  }
}

function usableQuotes(job: Job): Quote[] {
  return job.quotes.filter((q) => !q.rejectedReason && q.identicalPart && q.inStock).sort((a, b) => a.landedTotal - b.landedTotal);
}

/** Callback trigger: all sourcing calls ended | warranty + ≥2 suppliers ended (with a usable result) | timeout. */
function evaluateCallback(jobId: string, timedOut: boolean) {
  const job = jobs.get(jobId);
  if (!job || job.state !== 'SOURCING') return;
  if (!timedOut && onlinePending.has(jobId)) return;
  const sc = sourcingCalls(jobId);
  let trigger = `sourcing timeout (${config.caps.sourcingTimeoutSeconds}s)`;
  if (!timedOut) {
    // While calls are still being placed, only the early "warranty + 2 suppliers" rule may fire.
    const ended = sc.filter((c) => c.state === 'ended');
    const allEnded = !dialing.has(jobId) && ended.length === sc.length;
    const warrantyEnded = job.kind === 'enterprise' || ended.some((c) => c.lane === 'warranty');
    const suppliersEnded = ended.filter((c) => c.lane === 'supplier').length;
    const haveResult = job.warranty?.covered === true || usableQuotes(job).length > 0;
    const early = warrantyEnded && suppliersEnded >= 2 && haveResult;
    if (!allEnded && !early) return;
    trigger = allEnded ? 'all sourcing calls ended' : `warranty + ${suppliersEnded} suppliers ended with a usable result`;
  }
  // One-shot. Consumer: CAS SOURCING→AWAITING_CONFIRMATION. Enterprise: the job must stay SOURCING until the
  // tech call is reserved (guards refuse calls for NOTIFIED jobs), so a local latch guards it instead.
  if (job.kind === 'enterprise') {
    if (faultTriggered.has(jobId)) return;
    faultTriggered.add(jobId);
  } else if (!move(jobId, 'SOURCING', 'AWAITING_CONFIRMATION', `callback trigger: ${trigger}`)) return;
  clearTimers(jobId);
  const why = timedOut ? `Sourcing timeout (${config.caps.sourcingTimeoutSeconds}s)` : 'Sourcing calls finished';
  // Never hang up on a person mid-conversation: an early trigger lets live calls finish on their own (each is capped
  // by maxDurationSeconds). Only a real sourcing timeout ends calls that are still going.
  if (timedOut) {
    for (const c of sc) {
      if (c.state !== 'ended') void dialer.endCall(c.callId);
    }
  }
  const simCtx = anySim(sc);
  const fresh = jobs.get(jobId) ?? job;
  const best = rank(fresh);
  if (best) {
    jobs.update(jobId, (j) => (j.bestDeal = best));
    const tech = fresh.part?.techVisitCost ?? 0;
    const savedVsTech = tech > 0 ? round2(tech - best.landedTotal) : null;
    const others = usableQuotes(fresh).filter((q) => q.callId !== best.callId && q.vendorId !== best.vendorId).sort((a, b) => a.landedTotal - b.landedTotal);
    const savedVsNextBest = others.length ? round2(others[0].landedTotal - best.landedTotal) : null;
    savings.set(jobId, { savedVsTech, savedVsNextBest });
    const parts_: string[] = [];
    if (best.landedTotal === 0 && best.vendorId === safeRoster()?.warranty.id) parts_.push(`Covered by warranty: ${best.supplier}, $0.`);
    else parts_.push(`${best.supplier}: ${usd(best.landedTotal)} landed, in stock, identical part.`);
    if (savedVsNextBest !== null && others.length) parts_.push(`Beats ${others[0].supplier} by ${usd(savedVsNextBest)}.`);
    if (savedVsTech !== null) parts_.push(`Saves ${usd(savedVsTech)} vs the ${usd(tech)} tech visit.`);
    ev(fresh, 'best_deal', {
      supplier: best.supplier,
      vendorId: best.vendorId,
      price: best.landedTotal,
      landedTotal: best.landedTotal,
      eta: best.eta,
      techVisitCost: tech,
      savedVsTech,
      saved: savedVsTech,
      savedVsNextBest,
      approvedBy: 'code',
      reason: `${why}. ${parts_.join(' ')}`,
    }, simCtx);
  } else {
    ev(fresh, 'note', { text: `${why}. No usable quote (identical part, in stock, within budget).` }, simCtx);
  }
  emitMetrics(fresh, simCtx);

  if (fresh.kind === 'enterprise') {
    // Move to NOTIFIED only after the tech call is placed: the dialer ends calls for jobs already in a terminal state.
    void place(fresh, { lane: 'tech', vendorId: safeRoster()?.tech?.id, maxSec: config.maxSec.tech })
      .then(() => move(jobId, 'SOURCING', 'NOTIFIED', 'tech call placed after sourcing concluded'))
      .catch((err) => fail('placeGuardedCall', err, jobId));
    return;
  }
  if (!best) {
    note(fresh, 'No usable deal found; escalated to a human to follow up.', simFlag(fresh, simCtx));
    move(jobId, 'AWAITING_CONFIRMATION', 'ESCALATED', 'no usable quote (identical part, in stock, within budget): escalated to a human');
    return;
  }
  if (fresh.consentCallback !== false) void placeCallback(jobId);
  else note(fresh, 'Caller declined a callback; holding the best deal for confirmation.', simFlag(fresh, simCtx));
}

function rank(job: Job): Quote | null {
  if (job.warranty?.covered) {
    const roster = safeRoster();
    const wc = calls.forJob(job.id).find((c) => c.lane === 'warranty');
    return {
      vendorId: roster?.warranty.id ?? 'warranty',
      supplier: roster?.warranty.name ?? 'Manufacturer warranty',
      price: 0,
      shipping: 0,
      landedTotal: 0,
      inStock: true,
      eta: null,
      identicalPart: true,
      callId: wc?.callId ?? '',
      source: 'tool',
    };
  }
  return usableQuotes(job)[0] ?? null;
}

async function placeCallback(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job || job.state !== 'AWAITING_CONFIRMATION') return;
  jobs.update(jobId, (j) => (j.callbackAttempts += 1));
  const ctx = await place(job, { lane: 'user', maxSec: config.maxSec.user });
  if (!ctx) {
    const cur = jobs.get(jobId);
    if (cur && cur.state === 'AWAITING_CONFIRMATION') {
      note(cur, 'Callback could not be placed; escalated.');
      move(jobId, 'AWAITING_CONFIRMATION', 'ESCALATED', 'callback could not be placed (guard or provider refused)');
    }
  }
}

// ---------- tools ----------
function handleWarranty(job: Job, ctx: CallCtx, a: Record<string, unknown>): string {
  const covered = bool(a.covered, false);
  const detail = str(a.detail) || (covered ? 'Covered under warranty' : 'Not covered');
  jobs.update(job.id, (j) => (j.warranty = { covered, detail }));
  calls.update(ctx.callId, { quoted: true });
  ev(job, 'warranty', { covered, detail, callId: ctx.callId, supplier: partyName(job, ctx.lane, ctx.vendorId) }, ctx);
  return 'Say: "Thank you, that is all I needed. Goodbye." and call end_call in the same reply.';
}

/** What a lane must have recorded before the agent may hang up, and what to ask instead. Lanes not listed hang up freely. */
const END_NEEDS: Partial<Record<Lane, { done: (job: Job, ctx: CallCtx) => boolean; ask: string }>> = {
  supplier: {
    done: (_job, ctx) => ctx.quoted,
    ask: "Don't hang up yet: you have no price. Ask \"What's the price, what's shipping, and when could it arrive?\", then call record_quote.",
  },
  warranty: {
    done: (job) => !!job.warranty,
    ask: "Don't hang up yet: you have no warranty answer. Ask once more whether the part is covered, then call record_warranty.",
  },
};
const endPushedBack = new Set<string>(); // callIds already told once to keep going; the second end_call always hangs up
/** Lets the goodbye spoken alongside end_call finish playing. */
const HANGUP_DELAY_MS = 4000;

function handleEndCall(job: Job, ctx: CallCtx): string {
  const need = END_NEEDS[ctx.lane];
  if (need && !need.done(job, ctx) && !endPushedBack.has(ctx.callId)) {
    endPushedBack.add(ctx.callId);
    ev(job, 'note', { kind: 'end_call_blocked', callId: ctx.callId, lane: ctx.lane, text: `${partyName(job, ctx.lane, ctx.vendorId)} call tried to hang up before recording a result; asked once more.` }, ctx);
    return need.ask;
  }
  setTimeout(() => void dialer.endCall(ctx.callId).catch(() => {}), HANGUP_DELAY_MS).unref();
  return 'Hanging up. If you have not said goodbye yet, say a short thank-you and goodbye now; otherwise say nothing.';
}

function handleQuote(job: Job, ctx: CallCtx, a: Record<string, unknown>): string {
  const price = numOrNaN(a.price);
  if (!Number.isFinite(price) || price < 0) return 'Sorry, could you repeat the price for that part?';
  const shipRaw = numOrNaN(a.shipping);
  const shipping = Number.isFinite(shipRaw) && shipRaw >= 0 ? shipRaw : 0;
  const vendorId = ctx.vendorId ?? 'unknown';
  const supplier = partyName(job, ctx.lane, ctx.vendorId);
  const partNumberSaid = str(a.partNumberSaid) || undefined;
  const quote: Quote = {
    vendorId,
    supplier,
    price: round2(price),
    shipping: round2(shipping),
    landedTotal: round2(price + shipping),
    inStock: bool(a.inStock, true),
    eta: str(a.eta) || null,
    partNumberSaid,
    identicalPart: job.part ? (!partNumberSaid || parts.isIdentical(partNumberSaid, job.part)) : false,
    callId: ctx.callId,
    source: 'tool',
  };
  const verdict = guards.checkQuote(job, quote);
  if (verdict && !verdict.ok) {
    quote.rejectedReason = verdict.detail ?? 'Rejected by guard';
    guardEv(job, { kind: verdict.kind ?? (!quote.identicalPart ? 'not_identical' : !quote.inStock ? 'out_of_stock' : 'quote'), action: verdict.action ?? 'skipped', reason: quote.rejectedReason, detail: quote.rejectedReason, vendorId, callId: ctx.callId }, ctx);
  }
  jobs.update(job.id, (j) => {
    j.quotes = j.quotes.filter((q) => q.callId !== ctx.callId);
    j.quotes.push(quote);
  });
  calls.update(ctx.callId, { quoted: true });
  const reason = quote.rejectedReason ?? `${supplier} quoted ${usd(quote.landedTotal)} landed${quote.identicalPart ? ', identical part' : ''}${quote.inStock ? ', in stock' : ''}.`;
  ev(job, 'quote', {
    supplier,
    vendorId,
    price: quote.price,
    shipping: quote.shipping,
    landedTotal: quote.landedTotal,
    inStock: quote.inStock,
    eta: quote.eta,
    partNumberSaid,
    identicalPart: quote.identicalPart,
    rejected: !!quote.rejectedReason,
    callId: ctx.callId,
    approvedBy: 'code',
    reason,
  }, ctx);
  return 'Close with exactly: "Okay, thanks. I may call you back. Bye." and call end_call in the same reply.';
}

function handleOrderDecision(job: Job, ctx: CallCtx, a: Record<string, unknown>): string {
  const best = job.bestDeal;
  if (job.state !== 'AWAITING_CONFIRMATION' || !best) {
    if (job.state === 'ORDERED') return 'The order is already placed. Thank them and say goodbye.';
    return 'There is no order waiting to confirm right now. Apologize and say goodbye.';
  }
  const approved = bool(a.approved, false);
  const approver: ApprovedBy = a.approvedBy === 'caregiver' ? 'caregiver' : 'user_voice';
  if (approved) {
    if (!move(job.id, 'AWAITING_CONFIRMATION', 'ORDERED', `${approver === 'caregiver' ? 'caregiver' : 'caller'} said yes by voice to ${best.supplier} at ${usd(best.landedTotal)}; within the budget cap`, approver)) return 'The order is already being handled. Say goodbye.';
    const realOrder = process.env.COMMERCE === 'lithic';
    ev(job, 'order_confirmed', {
      supplier: best.supplier,
      vendorId: best.vendorId,
      price: best.landedTotal,
      landedTotal: best.landedTotal,
      partNumber: job.part?.partNumber,
      eta: best.eta,
      confirmedBy: 'voice',
      approvedBy: approver,
      reason: `${approver === 'caregiver' ? 'Caregiver' : 'Caller'} said yes by voice; ${usd(best.landedTotal)} is within the budget cap${realOrder ? '; paying with a capped virtual card (sandbox)' : ' (mock order)'}`,
      callId: ctx.callId,
      mockOrder: !realOrder,
      ...(best.url ? { url: best.url } : {}),
    }, ctx);
    if (realOrder) {
      // After the tool result, never blocking it; placeOrder never rejects and emits its own error on failure.
      void placeOrder({ job: jobs.get(job.id) ?? job, quote: best, approvedBy: approver }).then((r) => {
        if (r.status !== 'placed') note(job, `Card order ${r.status}: ${r.reason ?? 'unknown'}. Kept as a mock order.`, simFlag(job, ctx));
      });
    }
    const eta = best.eta ? `, arriving ${best.eta}` : '';
    return `Done, I ordered the part. I'll call you when it arrives to help you install it. Is there anything else I can help you with?`;
  }
  if (!move(job.id, 'AWAITING_CONFIRMATION', 'DECLINED', `${approver === 'caregiver' ? 'caregiver' : 'caller'} declined the ${best.supplier} deal by voice; nothing ordered`, approver)) return 'Understood. Say goodbye.';
  ev(job, 'order_declined', { supplier: best.supplier, landedTotal: best.landedTotal, callId: ctx.callId, approvedBy: approver, reason: `${approver === 'caregiver' ? 'Caregiver' : 'Caller'} declined by voice; nothing ordered` }, ctx);
  return "No problem, I won't order anything. Thank them and say goodbye.";
}

/** safety_ack during intake, before start_job: no job yet, so the ack is kept on the call's diagnosis entry and replayed at start_job. */
function handleIntakeAck(e: Extract<CallEvent, { kind: 'tool' }>): string {
  const ctx = calls.get(e.callId);
  if (ctx && ctx.epoch !== getEpoch()) return 'Okay, thank you.';
  const kind = str(e.args.kind) || 'unknown';
  const tree = loadFaultTree(DIAG_TREE);
  let entry = diagByCall.get(e.callId);
  if (!entry) {
    entry = newDiagEntry(e, undefined, tree);
    diagByCall.set(e.callId, entry);
  }
  if (!entry.acks.includes(kind)) {
    entry.acks.push(kind);
    ev(null, 'safety_ack', { kind, callId: e.callId, phase: 'intake', approvedBy: 'caller' }, ctx ?? (e.callId.startsWith('sim') ? { mode: 'sim' as const } : null));
  }
  if (entry.escalated) return `Noted ${kind}. Testing has stopped; call start_job so it is logged.`;
  const nxt = Object.keys(entry.state.observations).length ? nextInstruction(entry, tree) : null;
  const follow = nxt?.test ? ` Now ask them: ${nxt.text}` : '';
  return `Noted ${kind}.${follow}`;
}

function handleSafetyAck(job: Job, ctx: CallCtx, a: Record<string, unknown>): string {
  const kind = str(a.kind) || 'unknown';
  jobs.update(job.id, (j) => {
    if (!j.safetyAcks.includes(kind)) j.safetyAcks.push(kind);
  });
  ev(job, 'safety_ack', { kind, callId: ctx.callId }, ctx);
  const acks = jobs.get(job.id)?.safetyAcks ?? [];
  const missing = ['unplugged', 'vent_cleared'].filter((k) => !acks.includes(k));
  return missing.length ? `Noted ${kind}. Still need to confirm: ${missing.join(', ').replace('_', ' ')}.` : `Noted ${kind}. All safety checks are done.`;
}

function handleInstall(job: Job, ctx: CallCtx, a: Record<string, unknown>): string {
  const steps = job.part?.installSteps ?? [];
  const of = steps.length;
  if (!job.part || job.part.safety === 'pro_required' || !of) return 'This repair has no DIY steps; it needs a licensed pro. Tell them a pro will follow up.';
  const step = Math.round(numOrNaN(a.step));
  if (!Number.isFinite(step) || step < 1 || step > of) return `There are ${of} steps. Call install_progress with a step number from 1 to ${of}.`;
  const blocked = guards.canAdvanceInstall(job, step);
  if (blocked && !blocked.ok) {
    guardEv(job, { kind: blocked.kind ?? 'safety', action: blocked.action ?? 'skipped', reason: blocked.detail, detail: blocked.detail, step, callId: ctx.callId }, ctx);
    const missing = ['unplugged', 'vent_cleared'].filter((k) => !job.safetyAcks.includes(k));
    const ask = missing.length ? ` Ask them to confirm ${missing.map((m) => (m === 'unplugged' ? 'it is unplugged' : 'the vent is cleared')).join(' and ')}, then call safety_ack for each.` : '';
    return `Not yet. ${blocked.detail ?? 'A safety check is missing.'}${ask}`;
  }
  if (job.state === 'DELIVERED') move(job.id, 'DELIVERED', 'INSTALLING', `install walkthrough started (step ${step} of ${of})`);
  const prev = job.installStep ?? 0;
  for (let s = prev + 1; s < step; s++) {
    ev(job, 'install_step', { step: s, of, text: steps[s - 1], skipped: true, callId: ctx.callId }, ctx);
  }
  if (step > prev) jobs.update(job.id, (j) => (j.installStep = step));
  ev(job, 'install_step', { step, of, text: steps[step - 1], callId: ctx.callId }, ctx);
  if (step >= of) return 'That was the last step. Ask them to run it on high for a minute and check it heats, then call report_fix.';
  return `Step ${step + 1} of ${of}: ${steps[step]}`;
}

function handleReportFix(job: Job, ctx: CallCtx, a: Record<string, unknown>): string {
  const ok = bool(a.ok, false);
  if (ok) {
    if (!move(job.id, ['INSTALLING', 'DELIVERED'], 'FIXED', 'caller reported the appliance works after the install', 'user_voice')) return 'Thanks! Say goodbye.';
    ev(job, 'fix_verified', { ok: true, detail: str(a.detail) || `${job.appliance ?? 'Appliance'} working`, callId: ctx.callId }, ctx);
    return 'Wonderful, it is fixed. Remind them to keep the vent clear, thank them, and say goodbye.';
  }
  note(job, 'Install did not fix it; escalated to an install-only pro.', simFlag(job, ctx));
  move(job.id, ['INSTALLING', 'DELIVERED'], 'ESCALATED', 'caller reported the install did not fix it: install-only pro follows up', 'user_voice');
  return "Sorry it's still not working. Tell them an install-only pro will follow up, then say goodbye.";
}

// ---------- agent's own tools: texting, notes, caller-reported delivery ----------
const CUSTOMER_LANES: Lane[] = ['user', 'delivery'];

/** Texts the customer on this call, and only them: outbound to the dialed number, inbound to caller ID. Never awaits Twilio. */
function handleSendText(e: Extract<CallEvent, { kind: 'tool' }>): string {
  const ctx = calls.get(e.callId);
  if (ctx && !CUSTOMER_LANES.includes(ctx.lane)) return 'Texts go only to the customer.';
  const job = openJobFor(e) ?? (ctx?.jobId ? jobs.get(ctx.jobId) : undefined);
  const to = callerPhone(e) || job?.customer.phone || '';
  if (!to) return "No number to text. Tell them you can't text this number.";
  let body = str(e.args.message).slice(0, 700);
  const steps = job?.part?.installSteps ?? [];
  if (bool(e.args.includeInstallSteps, false) && steps.length) {
    body = `${body}\n\n${job?.part?.name ?? 'Install'} (${job?.part?.partNumber ?? ''}):\n${steps.map((t, i) => `${i + 1}. ${t}`).join('\n')}\nUnplug it first. Questions? Call (619) 771-1086.`.trim();
  }
  if (bool(e.args.includeVideoLink, false) && job?.part) {
    const q = encodeURIComponent(`${job.part.partNumber} ${job.part.name.replace(/\s*\(.*?\)/g, '')} replacement`);
    body = `${body}\n\nHow-to videos for your exact part: https://www.youtube.com/results?search_query=${q}`.trim();
  }
  if (!body) return 'Nothing to send. Say what the text should say.';
  const sim = ctx?.mode === 'sim' || e.callId.startsWith('sim');
  if (sim || !whatsappEnabled()) {
    emit(job?.id ?? null, 'note', { kind: 'text_sent', to: maskPhone(to), text: body, dryRun: true }, { simulated: sim });
  } else {
    void sendWhatsApp(to, body, job?.id ?? null);
  }
  return 'Text sent.';
}

function handleSaveNote(e: Extract<CallEvent, { kind: 'tool' }>): string {
  const text = str(e.args.note);
  if (!text) return 'Nothing saved.';
  const ctx = calls.get(e.callId);
  const job = ctx?.jobId ? jobs.get(ctx.jobId) : openJobFor(e);
  const phone = ctx && !CUSTOMER_LANES.includes(ctx.lane) ? job?.customer.phone : callerPhone(e) || job?.customer.phone;
  if (phone) updateProfile(phone, (p) => rememberNote(p, text));
  if (job) jobs.update(job.id, (j) => j.notes.push(text.slice(0, 300)));
  emit(job?.id ?? null, 'note', { kind: 'agent_note', callId: e.callId, text: text.slice(0, 300) }, { simulated: ctx?.mode === 'sim' || e.callId.startsWith('sim') });
  return 'Saved.';
}

/** The caller says the part arrived: same transition as the carrier webhook, but the install happens on this call (no new dial). */
function handleMarkDelivered(job: Job, ctx: CallCtx): string {
  const steps = job.part?.installSteps ?? [];
  if (job.state === 'ORDERED') {
    move(job.id, 'ORDERED', 'DELIVERED', 'caller said the part arrived', 'user_voice');
    jobs.update(job.id, (j) => {
      j.safetyAcks = [];
    });
    ev(job, 'delivered', { partNumber: job.part?.partNumber, source: 'caller', callId: ctx.callId }, ctx);
  } else if (!['DELIVERED', 'INSTALLING'].includes(job.state)) {
    return `Nothing has been ordered yet. ${statusLine(job)}`;
  }
  if (!job.part || job.part.safety === 'pro_required' || !steps.length) return 'This part needs a licensed pro to install. Tell them a pro will follow up.';
  const at = jobs.get(job.id)?.installStep ?? 0;
  const acks = jobs.get(job.id)?.safetyAcks ?? [];
  const missing = ['unplugged', 'vent_cleared'].filter((k) => !acks.includes(k));
  const gate = missing.length ? `First get them to confirm ${missing.map((m) => ACK_PHRASE[m]).join(' and ')}, calling safety_ack for each. ` : '';
  return `Delivered. Install is ${steps.length} steps; offer to text them the steps too. ${gate}Step ${at + 1}: ${steps[Math.min(at, steps.length - 1)]}`;
}

async function handleTool(e: Extract<CallEvent, { kind: 'tool' }>): Promise<string | undefined> {
  if (e.name === 'start_job') {
    const ctx = calls.get(e.callId);
    if (ctx && ctx.epoch !== getEpoch()) return 'Okay.';
    const out = handleStartJob(e);
    try {
      rememberStartJob(e);
    } catch (err) {
      fail('memory', err, calls.get(e.callId)?.jobId ?? null);
    }
    return out;
  }
  if (e.name === 'lookup_caller') return handleLookupCaller(e);
  if (e.name === 'record_knowledge') return handleRecordKnowledge(e);
  if (e.name === 'record_test') return handleRecordTest(e);
  if (e.name === 'send_text') return handleSendText(e);
  if (e.name === 'save_note') return handleSaveNote(e);
  if (!calls.get(e.callId)?.jobId) openJobFor(e);
  if (e.name === 'safety_ack' && !calls.get(e.callId)?.jobId) return handleIntakeAck(e);
  const ctx = calls.get(e.callId);
  if (!ctx || ctx.epoch !== getEpoch()) return 'Okay, thank you.';
  const job = ctx.jobId ? jobs.get(ctx.jobId) : undefined;
  if (!job) return e.name === 'end_call' ? 'Okay, thank you.' : 'There is no open job for this caller yet. Diagnose first and call start_job.';
  if (job.state === 'STOPPED' || job.state === 'ESCALATED') return 'This request has been closed. Thank them and end the call.';
  switch (e.name) {
    case 'record_warranty':
      return handleWarranty(job, ctx, e.args);
    case 'record_quote':
      return handleQuote(job, ctx, e.args);
    case 'end_call':
      return handleEndCall(job, ctx);
    case 'record_order_decision':
      return handleOrderDecision(job, ctx, e.args);
    case 'safety_ack':
      return handleSafetyAck(job, ctx, e.args);
    case 'install_progress':
      if (job.state === 'ORDERED') handleMarkDelivered(job, ctx);
      return handleInstall(jobs.get(job.id) ?? job, ctx, e.args);
    case 'report_fix':
      return handleReportFix(job, ctx, e.args);
    case 'mark_delivered':
      return handleMarkDelivered(job, ctx);
  }
  return 'Okay.';
}

// ---------- call end ----------
async function handleEnded(e: Extract<CallEvent, { kind: 'ended' }>): Promise<void> {
  const orphan = diagByCall.get(e.callId);
  if (orphan && !orphan.attached && !orphan.droppedNoted && Object.keys(orphan.state.observations).length > 0) {
    // Intake ended (silence timeout, max duration, hang-up) after readings but before start_job: no job exists, so say so in the log.
    orphan.droppedNoted = true;
    const top = topHypothesis(orphan.state);
    const tree = loadFaultTree(orphan.state.faultTree);
    const name = tree.hypotheses.find((h) => h.id === top.id)?.name.toLowerCase() ?? top.id;
    emit(null, 'note', {
      text: `Intake call ${e.callId} ended (${e.endedReason}) after ${Object.keys(orphan.state.observations).length} diagnosis readings but before start_job; no job was created and nobody will be called back. Top guess ${name} (P ${top.p.toFixed(2)}). The caller needs to redial.`,
    }, { simulated: e.callId.startsWith('sim') });
  }
  const ctx = calls.get(e.callId);
  if (!ctx || ctx.epoch !== getEpoch()) return;
  if (endedCalls.has(e.callId)) return;
  endedCalls.add(e.callId);
  calls.update(e.callId, { state: 'ended' });
  const job = ctx.jobId ? jobs.get(ctx.jobId) : undefined;
  if (!job) return; // e.g. intake that never called start_job: no job
  const durationSec = Math.max(0, Number(e.durationSec) || 0);
  jobs.update(job.id, (j) => {
    const rec = j.calls.find((c) => c.callId === e.callId);
    if (rec) {
      rec.endedAt = Date.now();
      rec.endedReason = e.endedReason;
      rec.durationSec = durationSec;
    }
  });
  guards.settle(job, ctx, durationSec, e.costUsd ?? 0);
  snapshot(job);
  const party = partyName(job, ctx.lane, ctx.vendorId);
  ev(job, 'call_ended', { callId: e.callId, lane: ctx.lane, party, reason: e.reason, endedReason: e.endedReason, durationSec }, ctx);
  if (e.reason === 'voicemail') bump(voicemailsSkipped, job.id);
  if (e.reason === 'no_answer' || e.reason === 'voicemail') {
    const reason = e.reason === 'voicemail' ? `${party} went to voicemail. Skipped, no retry.` : `${party} didn't answer. Skipped, no retry.`;
    guardEv(job, { kind: e.reason, action: 'skipped', reason, detail: reason, callId: e.callId, lane: ctx.lane }, ctx);
  } else if (e.endedReason === 'silence-timed-out' && SOURCING_LANES.includes(ctx.lane) && !stuckHandled.has(e.callId)) {
    stuckHandled.add(e.callId);
    const reason = `${party} went silent (silence timeout). Ended the call, skipped.`;
    guardEv(job, { kind: 'stuck', action: 'skipped', reason, detail: reason, callId: e.callId }, ctx);
  }
  const spend = guards.checkSpend(job);
  if (spend && !spend.ok && NON_TERMINAL.includes(job.state)) {
    await stop(job.id, spend.detail ?? 'Agent spend cap reached.', 'budget');
  }
  const cur = jobs.get(job.id) ?? job;
  emitMetrics(cur, ctx);

  if (ctx.lane === 'user' && cur.intakeCallId === e.callId) {
    await startSourcing(cur.id);
  } else if (SOURCING_LANES.includes(ctx.lane)) {
    evaluateCallback(cur.id, false);
  } else if (ctx.lane === 'user' && cur.state === 'AWAITING_CONFIRMATION' && !inboundAttached.has(e.callId)) {
    // Callback ended with no decision.
    if (cur.callbackAttempts < 2) {
      note(cur, `Callback ended without a decision (${e.reason}). Retrying once in 20 s.`, simFlag(cur, ctx));
      later(cur.id, 20_000, () => placeCallback(cur.id));
    } else {
      note(cur, 'Two callbacks without a decision. Escalated to a human.', simFlag(cur, ctx));
      move(cur.id, 'AWAITING_CONFIRMATION', 'ESCALATED', 'callback limit: two callbacks ended without a decision');
    }
  }
}

async function stop(jobId: string, reason: string, kind: 'manual' | 'budget'): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;
  move(jobId, NON_TERMINAL, 'STOPPED', kind === 'budget' ? `agent spend cap: ${reason}` : `kill switch: ${reason}`);
  clearTimers(jobId);
  const live = calls.forJob(jobId).filter((c) => c.state !== 'ended');
  guardEv(job, { kind, action: 'stopped', reason, detail: reason, ...(kind === 'budget' ? { budget: 'agent_spend' } : {}), endedCalls: live.length }, anySim(live));
  await Promise.all(live.map((c) => dialer.endCall(c.callId).catch(() => {})));
  onlinePending.delete(jobId);
  const closed = await revokeCards(jobId).catch((err) => (fail('revokeCards', err, jobId), [] as string[]));
  if (closed.length) note(job, `Kill switch closed virtual card ···${closed.join(', ···')} at the issuer; any later charge is declined.`, anySim(live)?.mode === 'sim');
}

// ---------- public ----------
export const orchestrator: Orchestrator = {
  async onCallEvent(e) {
    try {
      if (e.kind === 'tool') {
        const hit = toolCache.get(e.toolCallId);
        if (hit) return hit;
        const p = handleTool(e).catch((err) => {
          fail(`tool:${e.name}`, err, calls.get(e.callId)?.jobId ?? null);
          return 'Saved. Keep the conversation going.';
        });
        if (e.toolCallId) toolCache.set(e.toolCallId, p);
        return p;
      }
      const ctx = calls.get(e.callId);
      if (ctx && ctx.epoch !== getEpoch()) return undefined;
      const job = ctx?.jobId ? jobs.get(ctx.jobId) : undefined;

      if (e.kind === 'ended') {
        await handleEnded(e);
        return undefined;
      }
      if (job && (job.state === 'STOPPED' || job.state === 'ESCALATED')) return undefined;

      if (e.kind === 'status') {
        if (!ctx) {
          if (e.callType === 'inbound') ensureInboundCtx(e.callId, e.fromNumber, null);
          return undefined;
        }
        if (e.status === 'live' && ctx.state !== 'live' && ctx.state !== 'ended') calls.update(e.callId, { state: 'live', liveAt: Date.now() });
        if (e.status === 'ended' && job && ctx.lane === 'user' && job.intakeCallId === e.callId) {
          await startSourcing(job.id);
        }
        return undefined;
      }

      if (e.kind === 'transcript') {
        const lane = ctx?.lane ?? 'user';
        ev(job ?? null, 'transcript', { callId: e.callId, lane, speaker: speakerFor(lane, e.role), text: e.text }, ctx ?? (e.callId.startsWith('sim') ? { mode: 'sim' } : null));
        if (job && e.role === 'other' && (lane === 'user' || lane === 'delivery') && !safetyFlagged.has(e.callId)) {
          const v = guards.safetyKeywords(e.text);
          if (v && !v.ok) {
            safetyFlagged.add(e.callId);
            ev(job, 'safety', { level: 'pro_required', reason: v.detail, callId: e.callId, source: 'transcript' }, ctx);
            note(job, `Safety keyword heard on the ${lane} call: ${v.detail}`, simFlag(job, ctx));
          }
        }
        return undefined;
      }
    } catch (err) {
      fail('onCallEvent', err, null);
      return e.kind === 'tool' ? 'Saved. Keep the conversation going.' : undefined;
    }
    return undefined;
  },

  async onDelivered(jobId) {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`Unknown job ${jobId}`);
    if (!move(jobId, 'ORDERED', 'DELIVERED', 'delivery webhook received for the ordered part')) throw new Error(`Job ${jobId} is ${job.state}, not ORDERED`);
    // Safety acks from the diagnosis call (days earlier) must not satisfy the install gate: re-confirm on the install call.
    jobs.update(jobId, (j) => {
      j.safetyAcks = [];
    });
    const sim = { mode: modeFor('delivery') };
    ev(job, 'delivered', { carrier: 'UPS', partNumber: job.part?.partNumber, simulatedWebhook: true }, sim);
    if (job.part?.safety === 'pro_required') {
      note(job, 'Part is pro-required: no DIY install call.', simFlag(job, sim));
      return;
    }
    await place(job, { lane: 'delivery', maxSec: config.maxSec.delivery });
  },

  async startFault(payload: FaultPayload) {
    const roster = safeRoster();
    const tech = roster?.tech;
    if (!tech) throw new Error('roster.tech is not configured');
    const fault: FaultPayload = { asset: str(payload.asset), code: str(payload.code), site: str(payload.site), techName: tech.name };
    const job = jobs.create({
      kind: 'enterprise',
      customer: { name: tech.name, phone: tech.phone },
      appliance: fault.asset,
      symptom: fault.code,
      fault,
      consentCallback: false,
    });
    const sim = { mode: modeFor('tech') };
    ev(job, 'fault', { asset: fault.asset, code: fault.code, site: fault.site, tech: tech.name, phone: maskPhone(tech.phone) }, sim);
    const hit = parts.byFault(fault.code);
    if (!hit) {
      note(job, `Unknown fault code "${fault.code}". Escalated to a human.`, simFlag(job, sim));
      move(job.id, 'NEW', 'ESCALATED', `unknown fault code "${fault.code}": escalated to a human`);
      return jobs.get(job.id) ?? job;
    }
    jobs.update(job.id, (j) => (j.part = hit.part));
    ev(job, 'diagnosis', { appliance: fault.asset, code: fault.code, issue: hit.issue, confidence: hit.confidence, label: 'lookup prior' }, sim);
    ev(job, 'part_identified', { part: hit.part.name, partNumber: hit.part.partNumber, crossRefs: hit.part.crossRefs }, sim);
    ev(job, 'safety', { level: 'pro_required', reason: 'HV/exhaust work: certified tech only' }, sim);
    move(job.id, 'NEW', 'DIAGNOSED', `fault code ${fault.code} mapped to ${hit.part.partNumber}; certified-tech lane`);
    void startSourcing(job.id).catch((err) => fail('startSourcing', err, job.id));
    return jobs.get(job.id) ?? job;
  },

  async stopJob(jobId, reason) {
    await stop(jobId, reason || 'Manual kill switch.', 'manual');
  },

  resetAll() {
    const live = calls.live();
    bumpEpoch();
    for (const id of timers.keys()) clearTimers(id);
    timers.clear();
    for (const c of live) void endCallCtx(c);
    jobs.reset();
    calls.reset();
    resetEvents();
    startJobCache.clear();
    toolCache.clear();
    endedCalls.clear();
    dialing.clear();
    stuckHandled.clear();
    savings.clear();
    safetyFlagged.clear();
    faultTriggered.clear();
    guardsFired.clear();
    voicemailsSkipped.clear();
    diagByCall.clear();
    inboundAttached.clear();
    onlinePending.clear();
    resetOrders();
  },
};
