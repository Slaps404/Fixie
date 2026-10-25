// What happened on a job, as plain lines the voice agent can rely on: diagnosis, warranty answer, every quote, the order,
// and (detail) what each party actually said. Built from the persisted job plus this process's event log.
import { eventsFor } from './events.ts';
import type { Job, Quote } from './types.ts';

const usd = (n: number) => `$${n.toFixed(2)}`;
const TZ = process.env.FIXIE_TZ || process.env.TZ || 'America/Los_Angeles';
const when = (ms: number) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });

function quoteLine(q: Quote, chosen: boolean): string {
  const where = q.source === 'online' ? `${q.supplier} (web)` : q.supplier;
  if (!q.inStock) return `${where}: out of stock`;
  const cost = `${usd(q.landedTotal)} landed (${usd(q.price)} + ${usd(q.shipping)} shipping)`;
  const eta = q.eta ? `, arrives ${q.eta}` : '';
  const verdict = chosen ? ' [chosen]' : q.rejectedReason ? ` [skipped: ${q.rejectedReason}]` : '';
  return `${where}: ${cost}${eta}${q.identicalPart ? '' : ', not the identical part'}${verdict}`;
}

/** Short history for prompts and lookup_caller. */
export function jobSummary(job: Job): string {
  const out: string[] = [];
  out.push(`Job ${job.id}, opened ${when(job.createdAt)}: ${[job.appliance, job.model].filter(Boolean).join(' ') || 'appliance'}, "${job.symptom ?? 'not working'}". State: ${job.state.toLowerCase().replace(/_/g, ' ')}.`);
  if (job.part) out.push(`Part: ${job.part.name} ${job.part.partNumber}.`);
  if (job.warranty) out.push(`Warranty line: ${job.warranty.covered ? 'covered' : 'not covered'}${job.warranty.detail ? ` (${job.warranty.detail})` : ''}.`);
  const quotes = job.quotes ?? [];
  if (quotes.length) {
    const best = job.bestDeal;
    const seen = new Set<string>();
    const lines = quotes
      .filter((q) => !seen.has(q.supplier) && seen.add(q.supplier))
      .slice(0, 6)
      .map((q) => quoteLine(q, !!best && q.supplier === best.supplier && q.landedTotal === best.landedTotal));
    out.push(`Quotes: ${lines.join('; ')}.`);
  }
  const ended = (job.calls ?? []).filter((c) => c.lane === 'supplier' && c.endedReason && !quotes.some((q) => q.callId === c.callId));
  if (ended.length) out.push(`Supplier calls with no quote: ${ended.length} (no answer or no price).`);
  if (['ORDERED', 'DELIVERED', 'INSTALLING', 'FIXED'].includes(job.state) && job.bestDeal) {
    out.push(`Ordered: ${job.bestDeal.supplier}, ${usd(job.bestDeal.landedTotal)}${job.bestDeal.eta ? `, arriving ${job.bestDeal.eta}` : ''}.`);
  }
  if (job.installStep) out.push(`Install: step ${job.installStep} of ${job.part?.installSteps.length ?? '?'} done.`);
  const notes = (job.notes ?? []).slice(-4);
  if (notes.length) out.push(`Job notes: ${notes.join('; ')}.`);
  return out.join(' ');
}

/** Everything, for the job_details tool: the summary plus the last lines of each supplier and warranty call. */
export function jobDetails(job: Job): string {
  const byCall = new Map<string, { lane: string; lines: string[] }>();
  for (const e of eventsFor(job.id)) {
    const lane = String(e.data.lane ?? '');
    if (e.type !== 'transcript' || (lane !== 'supplier' && lane !== 'warranty')) continue;
    const callId = String(e.data.callId ?? '');
    const call = byCall.get(callId) ?? { lane, lines: [] };
    call.lines.push(`${e.data.speaker === 'agent' ? 'Fixie' : 'Them'}: ${String(e.data.text ?? '').slice(0, 200)}`);
    byCall.set(callId, call);
  }
  const party = (callId: string, lane: string) =>
    lane === 'warranty' ? 'Warranty line' : (job.quotes ?? []).find((q) => q.callId === callId)?.supplier ?? 'A supplier';
  const calls = [...byCall.entries()].map(([callId, c]) => `${party(callId, c.lane)} call: ${c.lines.slice(-6).join(' / ')}`);
  return [jobSummary(job), ...calls].join('\n').slice(0, 3500);
}
