'use client';

import { useEffect } from 'react';

// One-way scroll effects. `.reveal` elements rise in once and stay. Each `.tx`
// moment gets --p (0–100, how far it has scrolled through the viewport), which
// only ever grows, so the transcript never un-writes when you scroll back up.
export function ScrollEffects() {
  useEffect(() => {
    let pending = [...document.querySelectorAll<HTMLElement>('.reveal')];
    const moments = [...document.querySelectorAll<HTMLElement>('.tx')];
    const seen = new Map<HTMLElement, number>();
    let frame = 0;
    const update = () => {
      frame = 0;
      const h = window.innerHeight;
      // Anything whose top has passed 90% of the viewport is in, including
      // elements a fast scroll jumped clean over.
      pending = pending.filter((el) => {
        if (el.getBoundingClientRect().top >= h * 0.9) return true;
        el.classList.add('is-in');
        return false;
      });
      for (const el of moments) {
        const r = el.getBoundingClientRect();
        const p = Math.min(100, Math.max(0, ((h - r.top) / (h + r.height)) * 100));
        if (p > (seen.get(el) ?? 0)) {
          seen.set(el, p);
          el.style.setProperty('--p', p.toFixed(1));
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  return null;
}
