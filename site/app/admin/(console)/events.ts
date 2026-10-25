import type { FixieEvent } from './types';
import { AGENT, FAULT, OK, WARM, money } from './ui';

export const typeColor = (t: string) =>
  t === 'error' ? FAULT
  : t === 'guard' || t === 'safety' ? WARM
  : t.startsWith('call_') ? AGENT
  : t === 'transcript' ? '#A1A1A6'
  : t === 'job_state' || t === 'order_confirmed' || t === 'fix_verified' ? OK
  : '#8E8E93';

export function summarize(e: FixieEvent): string {
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
