'use client';

import { useState } from 'react';
import { searchCustomers } from './derive';
import type { CustomerView } from './types';
import { Badge, Btn, Empty, KV, Section, inputCls, mono, panel, small, stamp, stateColor } from './ui';

export function CustomersTab({ customers, onText }: { customers: CustomerView[]; onText: (key: string) => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const list = searchCustomers(customers, query);
  const sel = list.find((c) => c.key === picked) ?? list[0] ?? null;

  if (customers.length === 0)
    return <Empty title="No customers yet." hint="A customer appears here after they call the Fixie line or text it. Their appliances, jobs and notes are remembered across calls." />;

  return (
    <div className="grid gap-2.5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <div className={`${panel} flex min-w-0 flex-col p-3.5 lg:max-h-[calc(100vh-210px)]`}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, appliance" className={`${inputCls} mb-2`} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && <p className="m-0 py-3 text-[12.5px] text-faint">No customer matches &ldquo;{query}&rdquo;.</p>}
          {list.map((c) => (
            <button
              key={c.key}
              onClick={() => setPicked(c.key)}
              className={`flex w-full flex-col gap-0.5 border-b border-line px-2 py-2.5 text-left last:border-0 hover:bg-[#18181A] ${sel?.key === c.key ? 'bg-[#18181A]' : ''}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px]">{c.name ?? 'Unknown caller'}</span>
                <span className={`${mono} shrink-0 text-[11.5px] text-muted`}>{c.jobs.length} {c.jobs.length === 1 ? 'job' : 'jobs'}</span>
              </span>
              <span className={`${mono} ${small}`}>
                {c.phone} · {c.lastSeen ? stamp(c.lastSeen) : 'never seen'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={`${panel} min-w-0 p-3.5`}>
        {!sel ? (
          <p className="m-0 py-3 text-[12.5px] text-faint">Pick a customer to see their appliances, jobs and notes.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[18px] font-light tracking-[-0.01em]">{sel.name ?? 'Unknown caller'}</span>
                <span className={`${mono} ${small}`}>{sel.phone}</span>
              </div>
              <Btn tone="light" onClick={() => onText(sel.key)}>Text</Btn>
            </div>
            <Section title="Profile">
              <KV k="Last seen" v={sel.lastSeen ? stamp(sel.lastSeen) : '—'} />
              <KV k="Jobs" v={sel.jobs.length} />
            </Section>
            <Section title={`Appliances (${sel.appliances.length})`}>
              {sel.appliances.length === 0 && <span className="text-[12.5px] text-faint">None on file. Fixie records an appliance when the customer describes one on a call.</span>}
              {sel.appliances.map((a, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 py-1 text-[12.5px]">
                  <span>{a.appliance}</span>
                  <span className={`${mono} text-[11.5px] text-muted`}>{a.model || 'model unknown'}{a.purchaseYear ? ` · ${a.purchaseYear}` : ''}</span>
                </div>
              ))}
            </Section>
            <Section title={`Jobs (${sel.jobs.length})`}>
              {sel.jobs.length === 0 && <span className="text-[12.5px] text-faint">No jobs yet.</span>}
              {[...sel.jobs].sort((a, b) => b.at - a.at).map((j) => (
                <div key={j.jobId} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{j.issue || 'No issue recorded'}</span>
                  <span className={`${mono} shrink-0 text-[11px] text-faint`}>{stamp(j.at)}</span>
                  <span className="shrink-0"><Badge color={stateColor(j.state)}>{j.state}</Badge></span>
                </div>
              ))}
            </Section>
            <Section title={`Notes (${sel.notes.length})`}>
              {sel.notes.length === 0 && <span className="text-[12.5px] text-faint">No notes. The agent saves notes about preferences and access instructions during calls.</span>}
              {sel.notes.map((n, i) => (
                <div key={i} className="py-0.5 text-[12.5px] text-body">{n}</div>
              ))}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
