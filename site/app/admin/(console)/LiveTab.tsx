'use client';

import { useMemo, useState } from 'react';
import { JobDetail, TERMINAL } from './JobDetail';
import { summarize, typeColor } from './events';
import type { useLiveData } from './useLiveData';
import type { FixieEvent } from './types';
import { Badge, Btn, Stat, AGENT, FAULT, WARM, clock, dur, mono, money, panel, small, stateColor, type Act } from './ui';

type Props = { data: ReturnType<typeof useLiveData>; busy: boolean; act: Act };

export function LiveTab({ data, busy, act }: Props) {
  const { events, snap, selected, setSelected, now, jobs, job, calls, live } = data;
  const [tab, setTab] = useState<'events' | 'log'>('events');
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<'all' | 'calls' | 'transcript' | 'guards' | 'errors' | 'state'>('all');
  const [jobOnly, setJobOnly] = useState(false);
  const [frozen, setFrozen] = useState<FixieEvent[] | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const guards = events.filter((e) => e.type === 'guard').length;
  const errors = events.filter((e) => e.type === 'error').length;
  const spend = jobs.reduce((s, j) => s + (j.agentCostUsd || 0), 0);
  const activeJobs = jobs.filter((j) => !TERMINAL.has(j.state)).length;
  const visible = useMemo(() => {
    const src = frozen ?? events;
    const q = filter.trim().toLowerCase();
    return src.filter((e) => {
      if (jobOnly && selected && e.jobId !== selected) return false;
      if (kind === 'calls' && !e.type.startsWith('call_')) return false;
      if (kind === 'transcript' && e.type !== 'transcript') return false;
      if (kind === 'guards' && e.type !== 'guard' && e.type !== 'safety') return false;
      if (kind === 'errors' && e.type !== 'error') return false;
      if (kind === 'state' && e.type !== 'job_state') return false;
      if (q && !`${e.type} ${e.jobId ?? ''} ${JSON.stringify(e.data)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, filter, kind, jobOnly, selected, frozen]);

  return (
  <div className="flex flex-col gap-2.5 p-2.5">
    {/* Stats */}
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
      <Stat label="Live calls" value={live.length} color={live.length ? AGENT : undefined} />
      <Stat label="Active jobs" value={activeJobs} />
      <Stat label="All jobs" value={jobs.length} />
      <Stat label="Calls seen" value={calls.length} />
      <Stat label="Guards tripped" value={guards} color={guards ? WARM : undefined} />
      <Stat label="Errors" value={errors} color={errors ? FAULT : undefined} />
      <Stat label="Agent spend" value={money(spend)} />
    </div>

    <div className="grid gap-2.5 xl:grid-cols-[minmax(300px,1fr)_minmax(0,1.35fr)_minmax(0,1.35fr)]">
      {/* Left: live calls + jobs */}
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className={`${panel} p-3.5`}>
          <div className="mb-2 flex items-center justify-between">
            <span className={small}>Live calls</span>
            <span className={small}>{live.length} now</span>
          </div>
          {live.length === 0 && <p className="m-0 py-3 text-[12.5px] text-faint">No calls in progress.</p>}
          <div className="flex flex-col gap-2">
            {live.map((c) => (
              <div key={c.callId} className="rounded-[10px] border border-line bg-bg hover:border-line-strong">
              <button
                onClick={() => c.jobId && setSelected(c.jobId)}
                className="flex w-full flex-col gap-1.5 p-3 pb-2 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full motion-safe:animate-pulse" style={{ background: AGENT }} />
                    <span className="text-[13px]">{c.party}</span>
                    <Badge color={AGENT}>{c.lane}</Badge>
                    {c.mode && <Badge color={c.mode === 'live' ? FAULT : '#8E8E93'}>{c.mode}</Badge>}
                  </span>
                  <span className={`${mono} text-[12px]`}>{dur((now - c.startedAt) / 1000)}</span>
                </div>
                <span className={`${mono} ${small}`}>
                  {c.callId} · {c.phone || '—'} · job {c.jobId ?? '—'}
                </span>
                {c.transcript.slice(-4).map((t, i) => (
                  <span key={i} className="text-[12px] leading-[1.4] text-body">
                    <span className="text-muted">{t.speaker}:</span> {t.text}
                  </span>
                ))}
              </button>
              <div className="flex justify-end px-3 pb-2.5">
                <Btn
                  tone="danger"
                  disabled={busy}
                  onClick={() => confirm(`End the live call with ${c.party}? The line hangs up now.`) && act({ action: 'end-call', callId: c.callId }, 'End call')}
                >
                  End call
                </Btn>
              </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${panel} p-3.5`}>
          <div className="mb-2 flex items-center justify-between">
            <span className={small}>Jobs</span>
            <span className={small}>{jobs.length}</span>
          </div>
          {!Array.isArray(snap?.jobs) && snap && <p className="m-0 text-[12.5px] text-fault">jobs: {(snap.jobs as any).error}</p>}
          {jobs.length === 0 && <p className="m-0 py-3 text-[12.5px] text-faint">No jobs yet.</p>}
          <div className="flex flex-col">
            {jobs.map((j) => {
              const liveHere = live.filter((c) => c.jobId === j.id).length;
              return (
                <button
                  key={j.id}
                  onClick={() => setSelected(j.id === selected ? null : j.id)}
                  className={`flex flex-col gap-1 border-b border-line px-1 py-2.5 text-left last:border-0 hover:bg-[#18181A] ${j.id === selected ? 'bg-[#18181A]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px]">
                      {j.customer?.name} · {j.appliance ?? j.fault?.asset ?? j.kind}
                    </span>
                    <Badge color={stateColor(j.state)}>{j.state}</Badge>
                  </div>
                  <span className={`${mono} ${small}`}>
                    {j.id} · {j.quotes.length} quotes · {j.calls.length} calls{liveHere ? ` · ${liveHere} live` : ''} · {clock(j.updatedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Middle: selected job */}
      <div className={`${panel} min-w-0 p-3.5`}>
        {!job ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-1 text-center">
            <span className="text-[15px] font-light">Pick a job or a live call</span>
            <span className={small}>Everything the server knows about it shows up here.</span>
          </div>
        ) : (
          <JobDetail job={job} calls={calls.filter((c) => c.jobId === job.id)} events={events.filter((e) => e.jobId === job.id)} now={now} busy={busy} act={act} />
        )}
      </div>

      {/* Right: event stream / server log */}
      <div className={`${panel} flex min-w-0 flex-col p-3.5 xl:max-h-[calc(100vh-190px)]`}>
        <div className="mb-2.5 flex items-center gap-1">
          {(['events', 'log'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`h-7 rounded-full px-3 text-[12px] ${tab === t ? 'bg-[#232326] text-text' : 'text-muted hover:text-text'}`}>
              {t === 'events' ? `Events (${events.length})` : 'Server log'}
            </button>
          ))}
        </div>

        {tab === 'events' ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter (text, job id, call id)"
                className="h-7 min-w-0 flex-1 rounded-full border border-line-strong bg-bg px-3 text-[12px] outline-none placeholder:text-faint focus:border-accent"
              />
              <button onClick={() => setFrozen((f) => (f ? null : events))} className={`h-7 rounded-full border px-3 text-[12px] ${frozen ? 'border-warm text-warm' : 'border-line-strong'}`}>
                {frozen ? 'Paused' : 'Pause'}
              </button>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {(['all', 'calls', 'transcript', 'guards', 'errors', 'state'] as const).map((k) => (
                <button key={k} onClick={() => setKind(k)} className={`h-6 rounded-full px-2.5 text-[11.5px] ${kind === k ? 'bg-[#232326] text-text' : 'text-muted hover:text-text'}`}>
                  {k}
                </button>
              ))}
              <label className={`ml-auto inline-flex items-center gap-1.5 text-[11.5px] ${selected ? 'text-muted' : 'text-faint'}`}>
                <input type="checkbox" checked={jobOnly} disabled={!selected} onChange={(e) => setJobOnly(e.target.checked)} className="accent-[#8E9BFF]" />
                selected job only
              </label>
            </div>
            <div className="min-h-[300px] flex-1 overflow-y-auto">
              {visible.length === 0 && <p className="m-0 py-3 text-[12.5px] text-faint">No events match.</p>}
              {[...visible].reverse().slice(0, 600).map((e) => (
                <div key={e.id} className="border-b border-line py-1.5 last:border-0">
                  <button
                    onClick={() => setOpen((s) => { const n = new Set(s); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; })}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    <span className={`${mono} shrink-0 text-[11px] text-faint`}>{clock(e.ts)}</span>
                    <span className={`${mono} w-[88px] shrink-0 truncate text-[11px]`} style={{ color: typeColor(e.type) }}>{e.type}</span>
                    <span className="min-w-0 flex-1 text-[12px] leading-[1.4] break-words">
                      {e.simulated && <span className="mr-1 text-[10.5px] text-faint">[sim]</span>}
                      {summarize(e)}
                    </span>
                    {e.jobId && (
                      <span
                        onClick={(ev) => { ev.stopPropagation(); setSelected(e.jobId); }}
                        className={`${mono} shrink-0 cursor-pointer text-[10.5px] text-faint hover:text-link`}
                      >
                        {e.jobId.slice(-6)}
                      </span>
                    )}
                  </button>
                  {open.has(e.id) && (
                    <pre className={`${mono} m-0 mt-1.5 overflow-x-auto rounded-[8px] bg-bg p-2.5 text-[11px] leading-[1.45] text-body`}>
                      {JSON.stringify(e, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <pre className={`${mono} m-0 min-h-[300px] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-bg p-3 text-[11px] leading-[1.5] text-body`}>
            {(snap?.log ?? []).slice().reverse().join('\n') || 'Empty.'}
          </pre>
        )}
      </div>
    </div>
  </div>
  );
}
