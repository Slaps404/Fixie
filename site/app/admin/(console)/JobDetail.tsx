'use client';

import { useState } from 'react';
import { summarize } from './events';
import type { FixieEvent, Job, LiveCall } from './types';
import { Badge, Btn, Section, KV, AGENT, FAULT, OK, WARM, clock, dur, mono, money, small, stateColor, type Act } from './ui';

export const TERMINAL = new Set(['FIXED', 'STOPPED', 'DECLINED', 'ESCALATED', 'NOTIFIED']);

export function JobDetail({
  job,
  calls,
  events,
  now,
  busy,
  act,
}: {
  job: Job;
  calls: LiveCall[];
  events: FixieEvent[];
  now: number;
  busy: boolean;
  act: Act;
}) {
  const [raw, setRaw] = useState(false);
  const [openCall, setOpenCall] = useState<string | null>(null);
  const posterior = Object.entries(job.diagnosis?.posterior ?? {}).sort((a, b) => b[1] - a[1]);
  const jobGuards = events.filter((e) => e.type === 'guard' || e.type === 'safety');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-light tracking-[-0.01em]">{job.customer?.name}</span>
            <Badge color={stateColor(job.state)}>{job.state}</Badge>
            <Badge color="#8E8E93">{job.kind}</Badge>
          </div>
          <span className={`${mono} ${small}`}>
            {job.id} · {job.customer?.phone} · created {clock(job.createdAt)} · updated {clock(job.updatedAt)} · age {dur((now - job.createdAt) / 1000)}
          </span>
          <span className="text-[12.5px] text-body">
            {job.appliance ?? job.fault?.asset} {job.model ? `· ${job.model}` : ''} {job.symptom ? `· ${job.symptom}` : ''}
            {job.fault ? ` · ${job.fault.code} @ ${job.fault.site}` : ''}
          </span>
        </div>
        <div className="flex gap-2">
          {job.state === 'ORDERED' && <Btn disabled={busy} onClick={() => act({ action: 'delivered', jobId: job.id }, 'Simulate delivered')}>Delivered</Btn>}
          {!TERMINAL.has(job.state) && (
            <Btn tone="danger" disabled={busy} onClick={() => confirm('Stop this job and end its live calls?') && act({ action: 'stop', jobId: job.id }, 'Stop job')}>
              Stop job
            </Btn>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="Part">
          {job.part ? (
            <>
              <KV k="Part" v={`${job.part.partNumber}`} />
              <KV k="Name" v={job.part.name} />
              <KV k="Safety" v={<span style={{ color: job.part.safety === 'pro_required' ? FAULT : undefined }}>{job.part.safety}</span>} />
              <KV k="Tech visit" v={money(job.part.techVisitCost)} />
            </>
          ) : (
            <span className="text-[12.5px] text-faint">Not identified yet.</span>
          )}
          {job.warranty && <KV k="Warranty" v={job.warranty.covered ? 'covered' : 'not covered'} />}
          {job.bestDeal && <KV k="Best deal" v={`${job.bestDeal.supplier} ${money(job.bestDeal.landedTotal)}`} />}
        </Section>
        <Section title="Guards and budget">
          <KV k="Guarded calls" v={job.guardedCalls} />
          <KV k="Reserved minutes" v={job.reservedMinutes?.toFixed?.(1) ?? job.reservedMinutes} />
          <KV k="Agent spend" v={money(job.agentCostUsd)} />
          <KV k="Callback attempts" v={job.callbackAttempts} />
          <KV k="Lane attempts" v={Object.entries(job.laneAttempts ?? {}).map(([k, v]) => `${k}:${v}`).join(' ') || '—'} />
          <KV k="Vendor calls" v={Object.entries(job.vendorCallCount ?? {}).map(([k, v]) => `${k}:${v}`).join(' ') || '—'} />
          <KV k="Safety acks" v={job.safetyAcks?.join(', ') || '—'} />
          {job.installStep != null && <KV k="Install step" v={job.installStep} />}
        </Section>
      </div>

      {posterior.length > 0 && (
        <Section title="Diagnosis">
          {posterior.map(([k, p]) => (
            <div key={k} className="flex items-center gap-2 py-0.5 text-[12px]">
              <span className="w-[140px] shrink-0 truncate text-body">{k}</span>
              <div className="h-1.5 flex-1 rounded-full bg-[#232326]">
                <div className="h-full rounded-full" style={{ width: `${Math.round(p * 100)}%`, background: AGENT }} />
              </div>
              <span className={`${mono} w-10 text-right text-[11px]`}>{Math.round(p * 100)}%</span>
            </div>
          ))}
          {Object.keys(job.diagnosis?.observations ?? {}).length > 0 && (
            <span className={`${mono} ${small}`}>
              {Object.entries(job.diagnosis!.observations).map(([k, v]) => `${k}=${v}`).join(' · ')}
            </span>
          )}
        </Section>
      )}

      <Section title={`Quotes (${job.quotes.length})`}>
        {job.quotes.length === 0 ? (
          <span className="text-[12.5px] text-faint">None yet.</span>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 pr-3 font-normal">Supplier</th>
                  <th className="py-1 pr-3 font-normal">Price</th>
                  <th className="py-1 pr-3 font-normal">Ship</th>
                  <th className="py-1 pr-3 font-normal">Landed</th>
                  <th className="py-1 pr-3 font-normal">Part said</th>
                  <th className="py-1 font-normal">ETA</th>
                </tr>
              </thead>
              <tbody>
                {job.quotes.map((q) => (
                  <tr key={q.callId + q.vendorId} className="border-t border-line align-top" style={q.rejectedReason ? { color: '#6E6E73' } : undefined}>
                    <td className="py-1.5 pr-3">
                      {q.supplier}
                      {job.bestDeal?.callId === q.callId && <span className="ml-1.5"><Badge color={OK}>best</Badge></span>}
                      {q.rejectedReason && <div className="text-[11px]" style={{ color: WARM }}>{q.rejectedReason}</div>}
                    </td>
                    <td className={`${mono} py-1.5 pr-3 ${q.rejectedReason ? 'line-through' : ''}`}>{money(q.price)}</td>
                    <td className={`${mono} py-1.5 pr-3`}>{money(q.shipping)}</td>
                    <td className={`${mono} py-1.5 pr-3`}>{money(q.landedTotal)}</td>
                    <td className={`${mono} py-1.5 pr-3`} style={{ color: q.identicalPart ? undefined : FAULT }}>{q.partNumberSaid ?? '—'}</td>
                    <td className="py-1.5">{q.eta ?? '—'}{q.inStock ? '' : ' · out of stock'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Calls (${calls.length})`}>
        {calls.length === 0 && <span className="text-[12.5px] text-faint">No calls yet.</span>}
        {calls.map((c) => (
          <div key={c.callId} className="border-b border-line py-1.5 last:border-0">
            <button onClick={() => setOpenCall(openCall === c.callId ? null : c.callId)} className="flex w-full items-center gap-2 text-left">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.endedAt ? '#3A3A3E' : AGENT }} />
              <span className="text-[12.5px]">{c.party}</span>
              <Badge color={AGENT}>{c.lane}</Badge>
              <span className={`${mono} ${small} truncate`}>{c.callId} · {c.phone}</span>
              <span className={`${mono} ml-auto shrink-0 text-[11.5px]`}>
                {c.endedAt ? `${dur(c.durationSec ?? (c.endedAt - c.startedAt) / 1000)} · ${c.reason ?? 'ended'}` : `live ${dur((now - c.startedAt) / 1000)}`}
              </span>
            </button>
            {openCall === c.callId && (
              <div className="mt-1.5 flex flex-col gap-1 rounded-[8px] bg-bg p-2.5">
                {c.transcript.length === 0 && <span className="text-[12px] text-faint">No transcript in this tab&rsquo;s event history.</span>}
                {c.transcript.map((t, i) => (
                  <span key={i} className="text-[12px] leading-[1.45] text-body">
                    <span className={`${mono} mr-1.5 text-[10.5px] text-faint`}>{clock(t.ts)}</span>
                    <span className="text-muted">{t.speaker}:</span> {t.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </Section>

      {jobGuards.length > 0 && (
        <Section title={`Guard events (${jobGuards.length})`}>
          {jobGuards.map((e) => (
            <div key={e.id} className="flex gap-2 py-0.5 text-[12px]">
              <span className={`${mono} shrink-0 text-[11px] text-faint`}>{clock(e.ts)}</span>
              <span style={{ color: WARM }}>{summarize(e)}</span>
            </div>
          ))}
        </Section>
      )}

      {job.notes?.length > 0 && (
        <Section title={`Notes (${job.notes.length})`}>
          {job.notes.map((n, i) => (
            <div key={i} className="py-0.5 text-[12px] text-body">{n}</div>
          ))}
        </Section>
      )}

      <Section title="Raw job" right={<button onClick={() => setRaw((r) => !r)} className="text-[11.5px] text-link hover:text-[#C9D0FF]">{raw ? 'hide' : 'show'}</button>}>
        {raw && <pre className={`${mono} m-0 max-h-[420px] overflow-auto rounded-[8px] bg-bg p-2.5 text-[11px] leading-[1.45] text-body`}>{JSON.stringify(job, null, 2)}</pre>}
      </Section>
    </div>
  );
}
