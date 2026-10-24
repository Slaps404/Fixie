'use client';

import { useMemo, useState } from 'react';
import { useApi, useEvents } from '@/lib/hooks';
import { describe, type Line } from '@/lib/describe';
import { money, savings, type Job } from '@/lib/types';
import { StateBadge } from './StateBadge';
import { LiveDot } from './LiveDot';

const TERMINAL = ['FIXED', 'STOPPED', 'ESCALATED', 'DECLINED'];
const AGENT_SPEND_CAP = 3;

const toneClass: Record<Line['tone'], string> = {
  info: 'border-slate-400',
  good: 'border-green-700 bg-green-50',
  warn: 'border-amber-600 bg-amber-50',
  bad: 'border-red-700 bg-red-50',
  talk: 'border-blue-300 bg-white text-slate-800',
};

export function JobDetail({ id }: { id: string }) {
  const { events, live } = useEvents();
  const mine = useMemo(() => events.filter((e) => e.jobId === id), [events, id]);
  const { data: job, error } = useApi<Job>(`/api/fixie/jobs/${encodeURIComponent(id)}`, mine.length);
  const [showTalk, setShowTalk] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [stopMsg, setStopMsg] = useState<string | null>(null);

  const lines = useMemo(
    () => mine.map((e) => ({ e, l: describe(e) })).filter((x): x is { e: typeof x.e; l: Line } => x.l !== null),
    [mine],
  );
  const guards = mine.filter((e) => e.type === 'guard');

  async function stop() {
    if (!window.confirm('Stop this job? This ends every live call for it.')) return;
    setStopping(true);
    setStopMsg(null);
    try {
      const r = await fetch(`/api/fixie/jobs/${encodeURIComponent(id)}/stop`, { method: 'POST' });
      setStopMsg(r.ok ? 'Job stopped. Live calls were ended.' : `Could not stop the job (${r.status}).`);
    } catch {
      setStopMsg('Could not reach the server.');
    } finally {
      setStopping(false);
    }
  }

  if (error && !job) return <p role="alert" className="mt-6 rounded-xl border-2 border-red-700 bg-red-50 p-4 text-lg text-red-900">{error}</p>;
  if (!job) return <p className="mt-6 text-xl">Loading&hellip;</p>;

  const s = savings(job);
  const done = TERMINAL.includes(job.state);

  return (
    <div className="mt-4 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-dark">
            {job.kind === 'enterprise' ? (job.fault?.asset ?? 'Enterprise job') : (job.appliance ?? 'New job')}
          </h1>
          <p className="mt-1 text-lg">
            {job.id} &middot; {job.customer.name} ({job.customer.phone}){job.symptom ? ` · ${job.symptom}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4"><StateBadge state={job.state} /><LiveDot live={live} /></div>
        </div>
        <div className="text-right">
          <button
            onClick={stop}
            disabled={done || stopping}
            className="min-h-14 rounded-2xl bg-red-700 px-8 py-3 text-xl font-extrabold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {stopping ? 'Stopping…' : 'Stop job'}
          </button>
          {stopMsg && <p role="status" className="mt-2 text-lg font-semibold">{stopMsg}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Part">{job.part ? <>{job.part.name}<div className="text-base">#{job.part.partNumber}</div></> : 'Not identified yet'}</Card>
        <Card title="Warranty">{job.warranty ? (job.warranty.covered ? 'Covered' : 'Not covered') : 'Not checked yet'}{job.warranty && <div className="text-base">{job.warranty.detail}</div>}</Card>
        <Card title="Saved vs tech visit">{s != null ? <>{money(s)}<div className="text-base">{money(job.bestDeal!.landedTotal)} vs {money(job.part!.techVisitCost)}</div></> : 'None yet'}</Card>
        <Card title="Fixie call spend">{money(job.agentCostUsd)}<div className="text-base">cap {money(AGENT_SPEND_CAP)} per job</div></Card>
      </div>

      <section aria-labelledby="quotes">
        <h2 id="quotes" className="text-2xl font-bold">Quotes</h2>
        {job.quotes.length === 0 ? <p className="mt-2 text-lg">No quotes yet.</p> : (
          <div className="mt-3 overflow-x-auto rounded-2xl border-2 border-slate-300 bg-white">
            <table className="w-full text-left text-lg">
              <thead className="bg-slate-100">
                <tr><th className="p-3">Supplier</th><th className="p-3">Part</th><th className="p-3">Price</th><th className="p-3">Shipping</th><th className="p-3">Landed total</th><th className="p-3">ETA</th><th className="p-3">Note</th></tr>
              </thead>
              <tbody>
                {[...job.quotes].sort((a, b) => Number(!!a.rejectedReason) - Number(!!b.rejectedReason) || a.landedTotal - b.landedTotal).map((q) => {
                  const best = job.bestDeal?.vendorId === q.vendorId && !q.rejectedReason;
                  return (
                    <tr key={q.vendorId + q.landedTotal} className={`border-t-2 border-slate-200 align-top ${best ? 'bg-green-50' : ''}`}>
                      <td className="p-3 font-semibold">{q.supplier}{best && <span className="ml-2 rounded bg-green-700 px-2 py-0.5 text-base text-white">Best</span>}</td>
                      <td className={`p-3 ${q.rejectedReason ? 'line-through text-slate-600' : ''}`}>{q.partNumberSaid ?? '-'}{!q.identicalPart && ' (not identical)'}</td>
                      <td className={`p-3 ${q.rejectedReason ? 'line-through text-slate-600' : ''}`}>{money(q.price)}</td>
                      <td className={`p-3 ${q.rejectedReason ? 'line-through text-slate-600' : ''}`}>{money(q.shipping)}</td>
                      <td className={`p-3 font-bold ${q.rejectedReason ? 'line-through text-slate-600' : ''}`}>{money(q.landedTotal)}</td>
                      <td className={`p-3 ${q.rejectedReason ? 'line-through text-slate-600' : ''}`}>{q.eta ?? '-'}</td>
                      <td className="p-3 text-base font-semibold text-red-800">{q.rejectedReason ? `Rejected: ${q.rejectedReason}` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="guards">
        <h2 id="guards" className="text-2xl font-bold">Guard events</h2>
        {guards.length === 0 ? <p className="mt-2 text-lg">No guardrails have tripped for this job.</p> : (
          <ul className="mt-3 space-y-3">
            {guards.map((g) => (
              <li key={g.id} className="rounded-xl border-l-8 border-amber-600 bg-amber-50 p-4 text-lg">
                <strong>{g.data.kind}</strong> ({g.data.action}): {g.data.reason ?? g.data.detail}
                <div className="text-base text-slate-700">{new Date(g.ts).toLocaleTimeString()}{g.simulated ? ' · simulated' : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="timeline">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="timeline" className="text-2xl font-bold">Live timeline</h2>
          <label className="inline-flex min-h-12 items-center gap-3 text-lg">
            <input type="checkbox" className="h-6 w-6" checked={showTalk} onChange={(e) => setShowTalk(e.target.checked)} />
            Show call transcripts
          </label>
        </div>
        {lines.length === 0 ? <p className="mt-2 text-lg">Waiting for events&hellip;</p> : (
          <ol className="mt-3 space-y-2" aria-live="polite">
            {lines.filter(({ l }) => showTalk || l.tone !== 'talk').map(({ e, l }) => (
              <li key={e.id} className={`rounded-lg border-l-8 px-4 py-2 text-lg ${toneClass[l.tone]}`}>
                <span className="mr-3 text-base text-slate-700">{new Date(e.ts).toLocaleTimeString()}</span>
                <strong>{l.label}</strong>: {l.text}
                {e.simulated && <span className="ml-2 rounded bg-slate-200 px-2 text-sm font-bold">SIMULATED</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4">
      <div className="text-base font-bold uppercase tracking-wide text-slate-700">{title}</div>
      <div className="mt-1 text-xl font-semibold">{children}</div>
    </div>
  );
}
