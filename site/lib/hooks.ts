'use client';

import { useEffect, useRef, useState } from 'react';
import type { FixieEvent, Job } from './types';

/** Live events from the SSE proxy. Replays history on connect; clears on `reset`. */
export function useEvents() {
  const [events, setEvents] = useState<FixieEvent[]>([]);
  const [live, setLive] = useState(false);
  const buf = useRef<FixieEvent[]>([]);

  useEffect(() => {
    const es = new EventSource('/api/fixie/events');
    const flush = setInterval(() => {
      if (!buf.current.length) return;
      const batch = buf.current;
      buf.current = [];
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const fresh = batch.filter((e) => !seen.has(e.id));
        return fresh.length ? [...prev, ...fresh].slice(-3000) : prev;
      });
    }, 150);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener('fixie', (e) => {
      try {
        buf.current.push(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore malformed */
      }
    });
    es.addEventListener('reset', () => {
      buf.current = [];
      setEvents([]);
    });
    return () => {
      clearInterval(flush);
      es.close();
    };
  }, []);

  return { events, live };
}

/** Fetch JSON from a route handler now, whenever `tick` changes (debounced), and every 5s. */
export function useApi<T>(url: string, tick: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    const run = async () => {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status === 404 ? 'Not found' : `Backend error (${r.status})`);
        const j = (await r.json()) as T;
        if (!dead) {
          setData(j);
          setError(null);
        }
      } catch (e) {
        if (!dead) setError((e as Error).message);
      }
    };
    const t = setTimeout(run, 300);
    const i = setInterval(run, 5000);
    return () => {
      dead = true;
      clearTimeout(t);
      clearInterval(i);
    };
  }, [url, tick]);

  return { data, error };
}

export type { Job };
