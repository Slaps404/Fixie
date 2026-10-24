import { config, loadRoster } from './config.ts';
import type { CallCtx, Guards } from './contracts.ts';
import type { GuardVerdict, Job, Lane, Roster, RosterEntry } from './types.ts';

const EXEMPT: Lane[] = ['user', 'delivery', 'tech'];
const EXEMPT_MAX_ATTEMPTS = 2;
const STOPPED_STATES = ['STOPPED', 'ESCALATED', 'FIXED', 'DECLINED', 'NOTIFIED'];

const phoneKey = (p: string | undefined) => (p ?? '').replace(/\D/g, '').slice(-10);
const usd = (n: number) => `$${n.toFixed(2)}`;
/** "$40" for whole numbers, "$40.50" otherwise. */
const capUsd = (n: number) => (Number.isInteger(n) ? `$${n}` : usd(n));
const fmtMin = (n: number) => String(Math.round(n * 100) / 100);

function rosterEntries(roster: Roster): RosterEntry[] {
  return [roster.user, roster.warranty, ...(roster.suppliers ?? []), roster.tech].filter(
    (e): e is RosterEntry => !!e && typeof e.phone === 'string',
  );
}

function safeRoster(): Roster | null {
  try {
    return loadRoster();
  } catch {
    return null;
  }
}

function vendorName(roster: Roster | null, vendorId: string | undefined, lane: Lane): string {
  const entries = roster ? rosterEntries(roster) : [];
  const byId = vendorId ? entries.find((e) => e.id === vendorId) : undefined;
  if (byId) return byId.name;
  if (lane === 'warranty' && roster?.warranty) return roster.warranty.name;
  if (lane === 'tech' && roster?.tech) return roster.tech.name;
  return vendorId ?? lane;
}

/**
 * Reservations not yet settled, per job, keyed by "lane|vendorId". Lets settle() only release
 * minutes for calls that were actually reserved (inbound intake calls never were).
 */
const pending = new Map<string, Map<string, number>>();
const settled = new Set<string>();
const resKey = (lane: Lane, vendorId: string | undefined) => `${lane}|${vendorId ?? ''}`;

export const budgetCap = (job: Job) => (job.kind === 'enterprise' ? config.techBudget : config.caps.budget);

export const guards: Guards = {
  reserve(job, req) {
    const roster = safeRoster();
    const name = vendorName(roster, req.vendorId, req.lane);
    const exempt = EXEMPT.includes(req.lane);
    const maxSec = req.maxSec > 0 ? req.maxSec : config.maxSec[req.lane];
    const minutes = maxSec / 60;

    if (STOPPED_STATES.includes(job.state)) {
      return { ok: false, kind: 'manual', action: 'stopped', detail: `job is ${job.state}; no further calls` };
    }

    // vendor_not_approved: destination must be a roster number or the job's own caller.
    const to = phoneKey(req.to);
    const approved =
      !!to &&
      (to === phoneKey(job.customer?.phone) || (roster ? rosterEntries(roster) : []).some((e) => phoneKey(e.phone) === to));
    if (!approved) {
      return {
        ok: false,
        kind: 'vendor_not_approved',
        action: 'skipped',
        detail: `${name} is not on the approved roster. Call blocked, skipped.`,
      };
    }

    if (exempt) {
      const attempts = job.laneAttempts[req.lane] ?? 0;
      if (attempts >= EXEMPT_MAX_ATTEMPTS) {
        return {
          ok: false,
          kind: 'max_calls',
          action: 'stopped',
          detail: `Already tried the ${req.lane} call ${attempts} times (limit ${EXEMPT_MAX_ATTEMPTS}). Stopped.`,
        };
      }
    } else {
      if (job.guardedCalls >= config.caps.maxCalls) {
        return {
          ok: false,
          kind: 'max_calls',
          action: 'stopped',
          detail: `Call limit reached: ${job.guardedCalls} of ${config.caps.maxCalls} vendor calls used. Not calling ${name}, stopped.`,
        };
      }
      const vkey = req.vendorId ?? req.lane;
      const count = job.vendorCallCount[vkey] ?? 0;
      if (count >= config.caps.maxCallsPerVendor) {
        return {
          ok: false,
          kind: 'loop',
          action: 'skipped',
          detail: `Already called ${name} ${count} times (limit ${config.caps.maxCallsPerVendor}). Loop blocked, skipped.`,
        };
      }
    }

    if (job.reservedMinutes + minutes > config.caps.maxMinutes + 1e-9) {
      return {
        ok: false,
        kind: 'minutes',
        action: 'stopped',
        detail: `Minutes cap: ${fmtMin(job.reservedMinutes)} of ${config.caps.maxMinutes} min used, the ${name} call needs ${fmtMin(minutes)} more. Stopped.`,
      };
    }

    // All checks passed: reserve synchronously.
    if (exempt) {
      job.laneAttempts[req.lane] = (job.laneAttempts[req.lane] ?? 0) + 1;
    } else {
      job.guardedCalls += 1;
      const vkey = req.vendorId ?? req.lane;
      job.vendorCallCount[vkey] = (job.vendorCallCount[vkey] ?? 0) + 1;
    }
    job.reservedMinutes += minutes;
    let m = pending.get(job.id);
    if (!m) pending.set(job.id, (m = new Map()));
    const k = resKey(req.lane, req.vendorId);
    m.set(k, (m.get(k) ?? 0) + 1);
    return { ok: true, detail: `Calling ${name}.` };
  },

  settle(job, call, durationSec, costUsd) {
    if (settled.has(call.callId)) return;
    settled.add(call.callId);
    const actual = Math.max(0, Number(durationSec) || 0) / 60;
    const m = pending.get(job.id);
    const k = resKey(call.lane, call.vendorId);
    const n = m?.get(k) ?? 0;
    if (m && n > 0) {
      m.set(k, n - 1);
      job.reservedMinutes += actual - call.maxSec / 60;
    } else {
      job.reservedMinutes += actual;
    }
    job.reservedMinutes = Math.max(0, job.reservedMinutes);
    if (typeof costUsd === 'number' && Number.isFinite(costUsd) && costUsd > 0) job.agentCostUsd += costUsd;
  },

  checkQuote(job, quote) {
    const cap = budgetCap(job);
    const landed = Number.isFinite(quote.landedTotal) ? quote.landedTotal : quote.price + quote.shipping;
    const who = quote.supplier || quote.vendorId;
    if (landed > cap) {
      return {
        ok: false,
        kind: 'budget',
        action: 'skipped',
        detail: `${who} quoted ${usd(landed)} landed. Over the ${capUsd(cap)} budget, skipped.`,
      };
    }
    if (!quote.identicalPart) {
      const said = quote.partNumberSaid ? ` (${quote.partNumberSaid})` : '';
      const want = job.part?.partNumber ? `, not ${job.part.partNumber}` : '';
      // No GuardKind exists for part mismatch / stock; kind is left unset.
      return { ok: false, action: 'skipped', detail: `${who} could not confirm the identical part${said}${want}. Skipped.` };
    }
    if (!quote.inStock) {
      return { ok: false, action: 'skipped', detail: `${who} has the part out of stock. Skipped.` };
    }
    return null;
  },

  checkStuck(job, calls, now) {
    const out: Array<{ callId: string; verdict: GuardVerdict }> = [];
    const limitMs = config.caps.stuckSeconds * 1000;
    let roster: Roster | null | undefined;
    for (const c of calls) {
      if (c.jobId !== job.id || c.state !== 'live' || c.quoted) continue;
      if (c.lane !== 'warranty' && c.lane !== 'supplier') continue;
      const since = c.liveAt ?? c.createdAt;
      if (now - since < limitMs) continue;
      if (roster === undefined) roster = safeRoster();
      const name = vendorName(roster, c.vendorId, c.lane);
      out.push({
        callId: c.callId,
        verdict: {
          ok: false,
          kind: 'stuck',
          action: 'skipped',
          detail: `${name} gave no quote after ${config.caps.stuckSeconds}s. Ended the call, skipped.`,
        },
      });
    }
    return out;
  },

  checkSpend(job) {
    if (job.agentCostUsd > config.spendCap) {
      return {
        ok: false,
        kind: 'budget',
        action: 'stopped',
        detail: `Agent spend ${usd(job.agentCostUsd)} is over the ${usd(config.spendCap)} cap. Stopped the job.`,
      };
    }
    return null;
  },

  canAdvanceInstall(job, step) {
    const part = job.part;
    if (!part) return null;
    if (part.safety === 'pro_required') {
      return {
        ok: false,
        kind: 'safety',
        action: 'escalated',
        detail: `${part.name} is pro-required work. No DIY install steps.`,
      };
    }
    const steps = part.installSteps ?? [];
    if (!steps.length) return null;
    let idx = steps.findIndex((s) => /plug in|plug it in|plug back in|restore power/i.test(s));
    if (idx < 0) idx = steps.length - 1;
    const gateStep = idx + 1;
    // Step 1 is "unplug". Every later step needs the unplugged ack; the plug-in step also needs the vent cleared.
    if (step < 2) return null;
    const missing: string[] = [];
    if (!job.safetyAcks.includes('unplugged')) missing.push('the dryer is unplugged');
    if (step >= gateStep && !job.safetyAcks.includes('vent_cleared')) missing.push('the vent is cleared');
    if (!missing.length) return null;
    return {
      ok: false,
      kind: 'safety',
      action: 'skipped',
      detail: `Can't go to step ${step} yet. First confirm ${missing.join(' and ')}.`,
    };
  },

  safetyKeywords(text) {
    if (!text) return null;
    // Emergencies: smoke, fire, a gas smell or leak → leave and call 911.
    const emergency = /smok|fire|gas smell|smell(s|ing)? (like |of )?gas|smell gas|gas leak/i;
    // Danger but not an emergency: burning or sparking.
    const hazard = /burn|spark/i;
    // Any gas appliance (the word "gas", or Whirlpool gas model prefixes like WGD/MGD) is pro-only, never DIY.
    const gasAppliance = /\bgas\b|\b[WM]GD[0-9A-Z]+/i;
    if (emergency.test(text)) {
      return { ok: false, kind: 'safety', action: 'escalated', detail: 'Possible smoke, fire, or gas. Leave the house and call 911. Pro required, no DIY.' };
    }
    if (hazard.test(text)) {
      return { ok: false, kind: 'safety', action: 'escalated', detail: 'Burning or sparking reported. Unplug it and stop using it. Pro required, no DIY.' };
    }
    if (gasAppliance.test(text)) {
      return { ok: false, kind: 'safety', action: 'escalated', detail: "Gas appliance. Don't open it or work on it yourself. A licensed pro must do this repair." };
    }
    return null;
  },
};
