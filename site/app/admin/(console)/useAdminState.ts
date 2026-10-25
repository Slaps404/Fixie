'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminState } from './types';

const POLL_MS = 3000;
const REVEAL_KEY = 'fixie-admin-reveal';

// Numbers stay masked unless the operator opts in, because this console is shown on stage.
export function useReveal() {
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    setReveal(localStorage.getItem(REVEAL_KEY) === '1');
  }, []);
  const toggle = useCallback(() => {
    setReveal((r) => {
      localStorage.setItem(REVEAL_KEY, r ? '0' : '1');
      return !r;
    });
  }, []);
  return [reveal, toggle] as const;
}

export function useAdminState(enabled: boolean, reveal: boolean) {
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await fetch(`/admin/data/state?reveal=${reveal ? 1 : 0}`, { cache: 'no-store' });
      if (res.status === 401) return void (window.location.href = '/admin/login');
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);
      // A slower earlier request must not overwrite the answer for the current reveal setting.
      if (mine !== seq.current) return;
      setState(out as AdminState);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      if (mine === seq.current) setError((err as Error).message);
    }
  }, [reveal]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [enabled, refresh]);

  return { state, error, updatedAt, refresh };
}
