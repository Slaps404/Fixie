import type { ReactNode } from 'react';

export const AGENT = '#8E9BFF';
export const WARM = '#F2A93B';
export const FAULT = '#FF6A55';
export const OK = '#7FD8C0';
export const GREY = '#8E8E93';

export const mono = 'font-[family-name:var(--font-admin-mono)]';
export const panel = 'rounded-[12px] bg-surface';
export const small = 'text-[11.5px] text-muted';
export const inputCls = 'h-8 rounded-full border border-line-strong bg-bg px-3 text-[12.5px] outline-none placeholder:text-faint focus:border-accent';

export const clock = (ts: string | number) => new Date(ts).toLocaleTimeString([], { hour12: false });
export const stamp = (ts: number) =>
  new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const dur = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
export const money = (n: number | undefined | null) => (typeof n === 'number' ? `$${n.toFixed(2)}` : '—');

export const stateColor = (s: string) =>
  s === 'FIXED' || s === 'ORDERED' || s === 'DELIVERED' ? OK
  : s === 'STOPPED' || s === 'ESCALATED' || s === 'DECLINED' ? FAULT
  : s === 'AWAITING_CONFIRMATION' || s === 'INSTALLING' ? WARM
  : AGENT;

export async function post(body: Record<string, unknown>) {
  const res = await fetch('/admin/data/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
  return out;
}

export type Act = (body: Record<string, unknown>, label: string) => void;

export function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className={`${mono} inline-flex items-center whitespace-nowrap rounded-full px-2 py-[1px] text-[10.5px] uppercase tracking-wide`} style={{ color, background: `${color}1A` }}>
      {children}
    </span>
  );
}

export function Btn({ onClick, children, tone = 'ghost', disabled, title }: { onClick: () => void; children: ReactNode; tone?: 'ghost' | 'light' | 'danger'; disabled?: boolean; title?: string }) {
  const cls =
    tone === 'light' ? 'bg-button text-button-text hover:bg-white'
    : tone === 'danger' ? 'border border-[#FF6A5566] text-fault hover:bg-[#FF6A551A]'
    : 'border border-line-strong text-text hover:border-[#4A4A50]';
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`inline-flex h-8 items-center whitespace-nowrap rounded-full px-3.5 text-[12.5px] transition-colors disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}

export function Stat({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className={`${panel} flex flex-col gap-1.5 px-4 py-3`}>
      <span className={small}>{label}</span>
      <span className="text-[26px] font-light leading-none tracking-[-0.02em]" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
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

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[12.5px]">
      <span className="text-muted">{k}</span>
      <span className={`${mono} text-right`}>{v}</span>
    </div>
  );
}

// Every empty list says what fills it, so a blank panel on stage reads as "nothing yet", not "broken".
export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-1 px-6 text-center">
      <span className="text-[15px] font-light">{title}</span>
      <span className={`${small} max-w-[420px]`}>{hint}</span>
    </div>
  );
}

export function Th({ children, right, w }: { children?: ReactNode; right?: boolean; w?: string }) {
  return <th className={`whitespace-nowrap px-3 py-2 text-[11.5px] font-normal text-muted ${right ? 'text-right' : 'text-left'} ${w ?? ''}`}>{children}</th>;
}
