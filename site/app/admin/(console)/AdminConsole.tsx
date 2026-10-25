'use client';

import { useState } from 'react';
import { CustomersTab } from './CustomersTab';
import { LiveTab } from './LiveTab';
import { MessagesTab } from './MessagesTab';
import { NumbersTab } from './NumbersTab';
import { OrdersTab } from './OrdersTab';
import { VendorsTab } from './VendorsTab';
import { useAdminState, useReveal } from './useAdminState';
import { useLiveData } from './useLiveData';
import type { TabId, TextTarget } from './types';
import { AGENT, Badge, Btn, FAULT, OK, WARM, mono, post, small } from './ui';

const TABS: { id: TabId; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'customers', label: 'Customers' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'orders', label: 'Orders' },
  { id: 'messages', label: 'Messages' },
  { id: 'numbers', label: 'Numbers' },
];

export function AdminConsole() {
  const live = useLiveData();
  const { stream, snap, snapErr, job, lastModes, refresh: refreshLive } = live;
  const [tab, setTab] = useState<TabId>('live');
  const [target, setTarget] = useState<TextTarget | null>(null);
  const [reveal, toggleReveal] = useReveal();
  const admin = useAdminState(tab !== 'live', reveal);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const openTab = (id: TabId) => {
    setTarget(null);
    setTab(id);
  };
  const text = (key: string) => {
    setTarget({ key, nonce: Date.now() });
    setTab('messages');
  };

  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(true);
    try {
      await post(body);
      setToast({ text: `${label}: done` });
      refreshLive();
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
        <nav className="flex flex-wrap items-center gap-1 border-t border-line px-3 py-1.5" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => openTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`h-8 rounded-full px-4 text-[13px] transition-colors ${tab === t.id ? 'bg-[#232326] text-text' : 'text-muted hover:text-text'}`}
            >
              {t.label}
              {t.id === 'live' && live.live.length > 0 && <span className={`${mono} ml-1.5 text-[11px]`} style={{ color: AGENT }}>{live.live.length}</span>}
              {t.id === 'customers' && admin.state && <span className={`${mono} ml-1.5 text-[11px] text-faint`}>{admin.state.customers.length}</span>}
              {t.id === 'orders' && admin.state && <span className={`${mono} ml-1.5 text-[11px] text-faint`}>{admin.state.orders.length}</span>}
            </button>
          ))}
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 pr-1 text-[12px] text-muted">
            <input type="checkbox" checked={reveal} onChange={toggleReveal} className="accent-[#8E9BFF]" />
            Show full numbers
            {reveal && <Badge color={WARM}>visible</Badge>}
          </label>
        </nav>
      </header>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-line-strong bg-surface px-4 py-2 text-[12.5px]" style={toast.bad ? { color: FAULT } : undefined}>
          {toast.text}
        </div>
      )}

      <div className={tab === 'live' ? '' : 'hidden'}>
        <LiveTab data={live} busy={busy} act={act} />
      </div>
      {tab !== 'live' && (
        <div className="p-2.5">
          {admin.error && (
            <div className="mb-2.5 rounded-[10px] border border-[#FF6A5544] bg-[#FF6A551A] px-3.5 py-2 text-[12.5px]" style={{ color: FAULT }}>
              Could not load admin data: {admin.error}. Retrying every 3 seconds.
            </div>
          )}
          {!admin.state ? (
            !admin.error && <p className={`${small} py-10 text-center`}>Loading…</p>
          ) : (
            <>
              {tab === 'customers' && <CustomersTab customers={admin.state.customers} onText={text} />}
              {tab === 'vendors' && <VendorsTab responses={admin.state.responses} customers={admin.state.customers} />}
              {tab === 'orders' && <OrdersTab orders={admin.state.orders} />}
              {tab === 'messages' && <MessagesTab state={admin.state} target={target} refresh={admin.refresh} />}
              {tab === 'numbers' && <NumbersTab directory={admin.state.directory} onText={text} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
