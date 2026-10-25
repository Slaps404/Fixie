'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FixieEvent, Job, LiveCall, Snapshot } from './types';

const MAX_EVENTS = 4000;

// Everything the Live tab and the header need: the event history, job snapshot, and calls rebuilt from events.
export function useLiveData() {
  const [events, setEvents] = useState<FixieEvent[]>([]);
  const [stream, setStream] = useState<'connecting' | 'open' | 'down'>('connecting');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [snapErr, setSnapErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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
        // React strict mode (dev) cancels the first effect mid-fetch; without this its late reply appends the history twice.
        if (stopped) return;
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

  const lastModes = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].data?.modes) return events[i].data.modes as Record<string, string>;
    return null;
  }, [events]);

  return { events, stream, snap, snapErr, selected, setSelected, now, refresh, jobs, job, calls, live, lastModes };
}
