// WS-2: the ONLY place that places calls. Resolves `to`, reserves guards synchronously, picks the provider by lane mode.
import { config, getEpoch, loadRoster, modeFor } from './config.ts';
import type { CallCtx, CallRequest, Dialer, Mode, VoiceProvider } from './contracts.ts';
import type { Job, Lane, Roster, RosterEntry } from './types.ts';
import { emit, maskPhone } from './events.ts';
import { calls } from './calls.ts';
import { guards } from './guards.ts';
import { jobs } from './jobs.ts';
import { vapiProvider } from './vapi/client.ts';
import { simProvider } from './vapi/sim.ts';

const providerFor = (mode: Mode): VoiceProvider => (mode === 'sim' ? simProvider : vapiProvider);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True when events for this job/call should carry the SIMULATED badge. */
export function simFlag(job: Job | undefined | null, ctx?: Pick<CallCtx, 'mode'> | null): boolean {
  if (job?.kind === 'enterprise' && modeFor('tech') === 'sim') return true;
  return ctx?.mode === 'sim';
}

export function safeRoster(): Roster | null {
  try {
    return loadRoster();
  } catch {
    return null;
  }
}

/** Human name of the other party on a call. */
export function partyName(job: Job | undefined | null, lane: Lane, vendorId?: string): string {
  const roster = safeRoster();
  if (lane === 'user' || lane === 'delivery') return job?.customer.name ?? roster?.user.name ?? 'Customer';
  if (lane === 'warranty') return roster?.warranty.name ?? 'Warranty line';
  if (lane === 'tech') return roster?.tech?.name ?? job?.customer.name ?? 'Tech';
  return roster?.suppliers.find((s) => s.id === vendorId)?.name ?? vendorId ?? 'Supplier';
}

/** Resolve the destination entry. Phones come ONLY from the roster or the job's caller ID. */
function resolve(job: Job, req: CallRequest, roster: Roster | null): RosterEntry | null {
  switch (req.lane) {
    case 'supplier': {
      const s = roster?.suppliers.find((e) => e.id === req.vendorId);
      return s ?? null;
    }
    case 'warranty':
      return roster?.warranty ?? null;
    case 'tech':
      return roster?.tech ?? null;
    case 'user':
    case 'delivery':
      if (!job.customer?.phone) return null;
      return { id: 'customer', name: job.customer.name, phone: job.customer.phone, lane: req.lane };
  }
}

function guardEvent(job: Job, lane: Lane, kind: string | undefined, action: string | undefined, reason: string) {
  emit(job.id, 'guard', { kind: kind ?? 'unknown', action: action ?? 'skipped', reason, detail: reason, lane }, { simulated: simFlag(job, { mode: modeFor(lane) }) });
}

const DEAD_STATES = ['STOPPED', 'ESCALATED', 'FIXED', 'DECLINED', 'NOTIFIED'];

async function createWithRetry(provider: VoiceProvider, req: Parameters<VoiceProvider['createCall']>[0]) {
  try {
    return await provider.createCall(req);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    if (!/concurrency/i.test(msg)) throw err;
    await sleep(5000);
    return await provider.createCall(req);
  }
}

export const dialer: Dialer = {
  async placeGuardedCall(job, req) {
    // Everything up to the first await is synchronous, so concurrent callers cannot race past the caps.
    const roster = safeRoster();
    const entry = resolve(job, req, roster);
    const vendorId = req.vendorId ?? (req.lane === 'warranty' || req.lane === 'tech' ? entry?.id : undefined);
    const maxSec = req.maxSec > 0 ? req.maxSec : config.maxSec[req.lane];
    if (!entry) {
      guardEvent(job, req.lane, 'vendor_not_approved', 'skipped', `No approved number for the ${req.lane} call${vendorId ? ` (${vendorId})` : ''}. Skipped.`);
      return null;
    }
    const to = entry.phone;
    const verdict = guards.reserve(job, { ...req, vendorId, maxSec, to });
    if (!verdict.ok) {
      guardEvent(job, req.lane, verdict.kind, verdict.action, verdict.detail ?? `Guard refused the ${req.lane} call.`);
      return null;
    }
    jobs.update(job.id, () => {}); // snapshot the reserved counters
    const exempt = req.lane === 'user' || req.lane === 'delivery' || req.lane === 'tech';
    const attempt = exempt ? (job.laneAttempts[req.lane] ?? 1) : (job.vendorCallCount[vendorId ?? req.lane] ?? 1);
    const epoch = getEpoch();
    // A roster entry may pin its own mode (e.g. one real supplier phone, the rest simulated). DRY_RUN always wins.
    const entryMode = req.lane === 'user' || req.lane === 'delivery' ? undefined : (entry as RosterEntry).mode;
    const mode: Mode = config.dryRun ? 'sim' : (entryMode ?? modeFor(req.lane));
    const provider = providerFor(mode);
    const name = `${job.id}|${vendorId ?? '-'}|${req.lane}`;
    const party = req.lane === 'user' || req.lane === 'delivery' ? job.customer.name : entry.name;

    let created: { callId: string; controlUrl?: string };
    try {
      created = await createWithRetry(provider, {
        to,
        name,
        spec: { lane: req.lane, job, vendor: entry, attempt },
        ctx: { jobId: job.id, lane: req.lane, vendorId, maxSec, epoch, attempt },
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      // Release the reserved minutes for a call that never happened.
      guards.settle(job, {
        callId: `failed_${job.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        jobId: job.id, lane: req.lane, vendorId, to, maxSec, mode, epoch,
        state: 'ended', createdAt: Date.now(), quoted: false, attempt,
      }, 0, 0);
      jobs.update(job.id, () => {});
      emit(job.id, 'error', { where: 'createCall', lane: req.lane, party, detail: msg.slice(0, 300) }, { simulated: simFlag(job, { mode }) });
      return null;
    }

    const ctx: CallCtx = {
      callId: created.callId,
      jobId: job.id,
      lane: req.lane,
      vendorId,
      to,
      maxSec,
      mode,
      epoch,
      state: 'ringing',
      createdAt: Date.now(),
      quoted: false,
      attempt,
      controlUrl: created.controlUrl,
    };
    // The call may have been dialed after STOP / resetAll snapshotted the live calls. End it now and stay silent.
    const live = jobs.get(job.id);
    if (epoch !== getEpoch() || !live || DEAD_STATES.includes(live.state)) {
      ctx.state = 'ended';
      await endCallCtx(ctx);
      // Release the reserved minutes for this call; skip when the whole store was reset (epoch change).
      if (epoch === getEpoch() && live) {
        guards.settle(live, ctx, 0, 0);
        jobs.update(job.id, () => {});
      }
      return null;
    }
    calls.register(ctx);
    jobs.update(job.id, (j) => {
      j.calls.push({ callId: ctx.callId, lane: req.lane, vendorId, to, startedAt: ctx.createdAt });
    });
    emit(
      job.id,
      'call_started',
      { callId: ctx.callId, lane: req.lane, party, vendorId, phone: maskPhone(to), attempt, mode, ...(mode === 'sim' ? { simulated: true } : {}) },
      { simulated: simFlag(job, ctx) },
    );
    return ctx;
  },

  async endCall(callId) {
    const ctx = calls.get(callId);
    if (!ctx || ctx.state === 'ended') return;
    await endCallCtx(ctx);
  },
};

/** End a call given its ctx (used by resetAll, after the registry is cleared). Never throws. */
export async function endCallCtx(ctx: CallCtx): Promise<void> {
  try {
    await providerFor(ctx.mode).endCall(ctx);
  } catch (err) {
    emit(ctx.jobId, 'error', { where: 'endCall', callId: ctx.callId, detail: ((err as Error)?.message ?? String(err)).slice(0, 300) });
  }
}
