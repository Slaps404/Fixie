'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// Loose mirrors of server/src/types.ts. The console renders whatever arrives, so nothing here is load-bearing.
type FixieEvent = { id: number; ts: string; jobId: string | null; type: string; data: Record<string, any>; simulated?: boolean };
type Quote = { vendorId: string; supplier: string; price: number; shipping: number; landedTotal: number; inStock: boolean; eta: string | null; partNumberSaid?: string; identicalPart: boolean; callId: string; rejectedReason?: string };
type CallRecord = { callId: string; lane: string; vendorId?: string; to: string; startedAt: number; endedAt?: number; endedReason?: string; durationSec?: number };
type Job = {
  id: string;
  kind: string;
  state: string;
  createdAt: number;
  updatedAt: number;
  customer: { name: string; phone: string };
  appliance?: string;
  model?: string;
  symptom?: string;
  part?: { partNumber: string; name: string; safety: string; safetyNote?: string; techVisitCost?: number };
  warranty?: { covered: boolean; detail: string };
  quotes: Quote[];
  bestDeal?: Quote;
  calls: CallRecord[];
  vendorCallCount: Record<string, number>;
  laneAttempts: Record<string, number>;
  guardedCalls: number;
  reservedMinutes: number;
  agentCostUsd: number;
  safetyAcks: string[];
  callbackAttempts: number;
  installStep?: number;
  diagnosis?: { posterior: Record<string, number>; observations: Record<string, string> };
  fault?: { asset: string; code: string; site: string };
  notes: string[];
};
type Snapshot = { at: string; apiUrl: string; health: any; jobs: Job[] | { error: string }; log: string[] };

type LiveCall = { callId: string; jobId: string | null; lane: string; party: string; phone: string; mode?: string; startedAt: number; endedAt?: number; durationSec?: number; reason?: string; transcript: { speaker: string; text: string; ts: string }[] };

const AGENT = '#8E9BFF';
const WARM = '#F2A93B';
const FAULT = '#FF6A55';
const OK = '#7FD8C0';

const MAX_EVENTS = 4000;
const TERMINAL = new Set(['FIXED', 'STOPPED', 'DECLINED', 'ESCALATED', 'NOTIFIED']);

const mono = 'font-[family-name:var(--font-admin-mono)]';
const panel = 'rounded-[12px] bg-surface';
const small = 'text-[11.5px] text-muted';

const typeColor = (t: string) =>
  t === 'error' ? FAULT
  : t === 'guard' || t === 'safety' ? WARM
  : t.startsWith('call_') ? AGENT
  : t === 'transcript' ? '#A1A1A6'
  : t === 'job_state' || t === 'order_confirmed' || t === 'fix_verified' ? OK
  : '#8E8E93';

const stateColor = (s: string) =>
  s === 'FIXED' || s === 'ORDERED' || s === 'DELIVERED' ? OK
  : s === 'STOPPED' || s === 'ESCALATED' || s === 'DECLINED' ? FAULT
  : s === 'AWAITING_CONFIRMATION' || s === 'INSTALLING' ? WARM
  : AGENT;

const clock = (ts: string | number) => new Date(ts).toLocaleTimeString([], { hour12: false });
const dur = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const money = (n: number | undefined) => (typeof n === 'number' ? `$${n.toFixed(2)}` : '—');

function summarize(e: FixieEvent): string {
  const d = e.data ?? {};
  switch (e.type) {
    case 'transcript':
      return `${d.speaker ?? d.lane}: ${d.text}`;
    case 'call_started':
      return `→ ${d.party ?? d.lane} (${d.lane}) ${d.phone ?? ''} ${d.mode ?? ''}${d.attempt > 1 ? ` · attempt ${d.attempt}` : ''}`;
    case 'call_ended':
      return `${d.party ?? d.lane} ended · ${d.reason ?? ''}${d.endedReason ? ` (${d.endedReason})` : ''}${d.durationSec != null ? ` · ${d.durationSec}s` : ''}`;
    case 'guard':
      return `${d.kind} · ${d.action}: ${d.reason ?? d.detail ?? ''}`;
    case 'job_state':
      return `${d.from} → ${d.to}${d.reason ? ` · ${d.reason}` : ''}${d.approvedBy ? ` · by ${d.approvedBy}` : ''}`;
    case 'quote':
      return `${d.supplier}: ${money(d.price)} + ${money(d.shipping)}${d.rejectedReason ? ` · REJECTED ${d.rejectedReason}` : ''}`;
    case 'note':
      return String(d.text ?? d.kind ?? JSON.stringify(d));
    case 'error':
      return `${d.where ?? 'error'}: ${d.detail ?? ''}`;
    case 'safety':
      return `${d.level}: ${d.reason ?? ''}`;
    case 'diagnosis_update': {
      const top = Object.entries((d.posterior ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 2);
      return `${d.test} = ${d.reading} → ${top.map(([k, p]) => `${k} ${Math.round(p * 100)}%`).join(', ')}`;
    }
    case 'order_confirmed':
      return `${d.supplier} · ${money(d.landedTotal)} · ${d.partNumber ?? ''} · eta ${d.eta ?? '?'} · ${d.approvedBy ?? ''}`;
    case 'metrics':
      return `calls ${d.guardedCalls}/${d.maxCalls} · min ${d.minutes}/${d.maxMinutes} · spend ${money(d.agentCostUsd)}/${money(d.spendCap)} · guards ${d.guardsFired ?? 0}`;
    default: {
      const s = JSON.stringify(d);
      return s.length > 220 ? s.slice(0, 220) + '…' : s;
    }
  }
}

async function post(body: Record<string, unknown>) {
  const res = await fetch('/admin/data/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
  return out;
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className={`${mono} inline-flex items-center rounded-full px-2 py-[1px] text-[10.5px] uppercase tracking-wide`} style={{ color, background: `${color}1A` }}>
      {children}
    </span>
  );
}

function Btn({ onClick, children, tone = 'ghost', disabled }: { onClick: () => void; children: React.ReactNode; tone?: 'ghost' | 'light' | 'danger'; disabled?: boolean }) {
  const cls =
    tone === 'light' ? 'bg-button text-button-text hover:bg-white'
    : tone === 'danger' ? 'border border-[#FF6A5566] text-fault hover:bg-[#FF6A551A]'
    : 'border border-line-strong text-text hover:border-[#4A4A50]';
  return (
    <button onClick={onClick} disabled={disabled} className={`inline-flex h-8 items-center rounded-full px-3.5 text-[12.5px] transition-colors disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className={`${panel} flex flex-col gap-1.5 px-4 py-3`}>
      <span className={small}>{label}</span>
      <span className="text-[26px] font-light leading-none tracking-[-0.02em]" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={small}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[12.5px]">
      <span className="text-muted">{k}</span>
      <span className={`${mono} text-right`}>{v}</span>
    </div>
  );
}

export function AdminConsole() {
  const [events, setEvents] = useState<FixieEvent[]>([]);
  const [stream, setStream] = useState<'connecting' | 'open' | 'down'>('connecting');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [snapErr, setSnapErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<'events' | 'log'>('events');
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<'all' | 'calls' | 'transcript' | 'guards' | 'errors' | 'state'>('all');
  const [jobOnly, setJobOnly] = useState(false);
  const [frozen, setFrozen] = useState<FixieEvent[] | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // Every event the server emits, polled once a second (a tunnel would buffer SSE).
  useEffect(() => {
    let last = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/admin/data/events?since=${last}`, { cache: 'no-store' });
        if (res.status === 401) return void (window.location.href = '/admin/login');
        const out = (await res.json()) as { reset?: boolean; events?: FixieEvent[]; error?: string };
        if (!res.ok || !out.events) throw new Error(out.error ?? `HTTP ${res.status}`);
        const evs = out.events;
        if (evs.length) last = evs[evs.length - 1].id;
        if (out.reset) {
          setSelected(null);
          setEvents(evs.slice(-MAX_EVENTS));
        } else if (evs.length) {
          setEvents((prev) => {
            const next = prev.concat(evs);
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
          });
        }
        setStream('open');
      } catch {
        setStream('down');
      }
      if (!stopped) timer = setTimeout(tick, 1000);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  // Jobs, health and the server log, polled.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/admin/data/snapshot', { cache: 'no-store' });
      if (res.status === 401) return void (window.location.href = '/admin/login');
      setSnap(await res.json());
      setSnapErr(null);
    } catch (err) {
      setSnapErr((err as Error).message);
    }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const jobs: Job[] = useMemo(() => (Array.isArray(snap?.jobs) ? [...snap.jobs].sort((a, b) => b.updatedAt - a.updatedAt) : []), [snap]);
  const job = jobs.find((j) => j.id === selected) ?? null;

  // Calls reconstructed from call_started / transcript / call_ended events.
  const calls = useMemo(() => {
    const map = new Map<string, LiveCall>();
    for (const e of events) {
      const d = e.data ?? {};
      if (!d.callId) continue;
      let c = map.get(d.callId);
      if (!c) {
        c = { callId: d.callId, jobId: e.jobId, lane: d.lane ?? '?', party: d.party ?? d.lane ?? '?', phone: d.phone ?? '', startedAt: Date.parse(e.ts), transcript: [] };
        map.set(d.callId, c);
      }
      if (e.type === 'call_started') Object.assign(c, { lane: d.lane, party: d.party ?? d.lane, phone: d.phone ?? '', mode: d.mode, startedAt: Date.parse(e.ts), jobId: e.jobId ?? c.jobId });
      if (e.type === 'transcript') c.transcript.push({ speaker: d.speaker ?? d.lane, text: d.text, ts: e.ts });
      if (e.type === 'call_ended') Object.assign(c, { endedAt: Date.parse(e.ts), durationSec: d.durationSec, reason: d.reason ?? d.endedReason });
    }
    // Jobs know about calls placed before this tab connected; fill in any the event history missed.
    for (const j of jobs)
      for (const r of j.calls)
        if (!map.has(r.callId))
          map.set(r.callId, { callId: r.callId, jobId: j.id, lane: r.lane, party: r.vendorId ?? r.lane, phone: r.to, startedAt: r.startedAt, endedAt: r.endedAt, durationSec: r.durationSec, reason: r.endedReason, transcript: [] });
    return [...map.values()].sort((a, b) => b.startedAt - a.startedAt);
  }, [events, jobs]);
  const live = calls.filter((c) => !c.endedAt);

  const guards = events.filter((e) => e.type === 'guard').length;
  const errors = events.filter((e) => e.type === 'error').length;
  const spend = jobs.reduce((s, j) => s + (j.agentCostUsd || 0), 0);
  const activeJobs = jobs.filter((j) => !TERMINAL.has(j.state)).length;
  const lastModes = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].data?.modes) return events[i].data.modes as Record<string, string>;
    return null;
  }, [events]);

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

  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(true);
    try {
      await post(body);
      setToast({ text: `${label}: done` });
      refresh();
    } catch (err) {
      setToast({ text: `${label} failed: ${(err as Error).message}`, bad: true });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const health = snap?.health;
  const backendUp = health && !health.error;

  return (
    <div className="min-h-screen bg-bg text-[13px] leading-normal text-text">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-[14px] font-medium">Fixie admin</span>
            <span className="inline-flex items-center gap-1.5 text-[12px]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: stream === 'open' ? OK : stream === 'down' ? FAULT : WARM }} />
              events {stream === 'open' ? 'live' : stream}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: backendUp ? OK : FAULT }} />
              backend {backendUp ? 'up' : 'down'}
              {backendUp && <Badge color={health.dryRun ? WARM : FAULT}>{health.dryRun ? 'dry run' : 'live calls'}</Badge>}
            </span>
            <span className={`${mono} ${small}`}>{snap?.apiUrl}</span>
            {health?.publicUrl && <span className={`${mono} ${small} hidden lg:inline`}>{health.publicUrl}</span>}
            {snapErr && <span className="text-[12px] text-fault">snapshot: {snapErr}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              disabled={busy}
              onClick={() =>
                (health?.dryRun || confirm('Backend is LIVE. A simulated intake starts a real job, and any lane in live mode will ring real phones. Continue?')) &&
                act({ action: 'sim-intake' }, 'Simulated intake call')
              }
            >
              Sim intake call
            </Btn>
            <Btn disabled={busy} onClick={() => act({ action: 'delivered', jobId: job?.state === 'ORDERED' ? job.id : undefined }, 'Simulate delivered')}>Simulate delivered</Btn>
            <Btn
              tone="danger"
              disabled={busy}
              onClick={() => confirm('Reset the demo? This clears every job, call and event on the server.') && act({ action: 'reset' }, 'Reset')}
            >
              Reset demo
            </Btn>
            <Btn onClick={() => post({ action: 'logout' }).finally(() => (window.location.href = '/admin/login'))}>Sign out</Btn>
          </div>
        </div>
        {/* Lane modes */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2">
          <span className={small}>Lane modes{lastModes ? '' : ' (unknown until changed)'}</span>
          {['user', 'warranty', 'supplier', 'delivery', 'tech'].map((lane) => {
            const mode = lastModes?.[lane];
            return (
              <button
                key={lane}
                disabled={busy}
                onClick={() => {
                  const next = mode === 'live' ? 'sim' : 'live';
                  if (next === 'live' && !confirm(`Switch ${lane} to LIVE? Real phones will ring.`)) return;
                  act({ action: 'mode', lane, mode: next }, `${lane} → ${next}`);
                }}
                className={`${mono} inline-flex h-6 items-center gap-1.5 rounded-full border border-line-strong px-2.5 text-[11px] hover:border-[#4A4A50]`}
              >
                {lane}
                <span style={{ color: mode === 'live' ? FAULT : mode === 'sim' ? AGENT : '#6E6E73' }}>{mode ?? '?'}</span>
              </button>
            );
          })}
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-line-strong bg-surface px-4 py-2 text-[12.5px]" style={toast.bad ? { color: FAULT } : undefined}>
          {toast.text}
        </div>
      )}

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
                  <button
                    key={c.callId}
                    onClick={() => c.jobId && setSelected(c.jobId)}
                    className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-bg p-3 text-left hover:border-line-strong"
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
    </div>
  );
}

function JobDetail({
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
  act: (body: Record<string, unknown>, label: string) => void;
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
