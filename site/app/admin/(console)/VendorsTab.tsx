'use client';

import { useMemo, useState } from 'react';
import { OUTCOME_LABEL, customerNameByJob, groupResponses, safeUrl } from './derive';
import type { CustomerView, ResponseOutcome, ResponseView } from './types';
import { AGENT, Badge, Empty, FAULT, GREY, OK, WARM, Th, clock, dur, mono, money, panel, small, stamp } from './ui';

const OUTCOME_COLOR: Record<ResponseOutcome, string> = { quoted: OK, rejected: FAULT, no_quote: WARM, in_progress: AGENT };

export function VendorsTab({ responses, customers }: { responses: ResponseView[]; customers: CustomerView[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupResponses(responses), [responses]);
  const names = useMemo(() => customerNameByJob(customers), [customers]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (groups.length === 0)
    return <Empty title="No vendor responses yet." hint="Each supplier or warranty call, and each online price check, shows up here once Fixie starts shopping for a part." />;

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((g) => (
        <div key={g.key} className={`${panel} min-w-0 p-3.5`}>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[14px]">{g.partNumber ? `Part ${g.partNumber}` : 'Part not identified'}</span>
            <span className={`${mono} ${small}`}>job {g.jobId}{names.get(g.jobId) ? ` · ${names.get(g.jobId)}` : ''}</span>
            <span className={`${small} ml-auto`}>{g.items.length} {g.items.length === 1 ? 'response' : 'responses'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] table-fixed border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line">
                  <Th w="w-[20%]">Supplier</Th>
                  <Th w="w-[15%]">Outcome</Th>
                  <Th right w="w-[10%]">Landed</Th>
                  <Th w="w-[9%]">Stock</Th>
                  <Th w="w-[9%]">ETA</Th>
                  <Th w="w-[12%]">Part</Th>
                  <Th w="w-[12%]">Call</Th>
                  <Th w="w-[13%]" />
                </tr>
              </thead>
              <tbody>
                {g.items.map((r) => (
                  <ResponseRows key={r.id} r={r} open={open.has(r.id)} onToggle={() => toggle(r.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function ResponseRows({ r, open, onToggle }: { r: ResponseView; open: boolean; onToggle: () => void }) {
  const q = r.quote;
  const url = safeUrl(q?.url ?? null);
  const callInfo = r.channel === 'online' ? 'online check' : [r.endedReason, r.durationSec != null ? dur(r.durationSec) : null].filter(Boolean).join(' · ') || (r.outcome === 'in_progress' ? 'on the line' : '—');
  return (
    <>
      <tr className={`border-b border-line align-top ${r.chosen ? 'bg-[#7FD8C00D]' : ''}`}>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span>{r.supplier}</span>
            <Badge color={GREY}>{r.channel}</Badge>
            {r.chosen && <Badge color={OK}>chosen</Badge>}
          </div>
          <div className={`${mono} text-[11px] text-faint`}>{stamp(r.at)} · {r.lane}</div>
        </td>
        <td className="px-3 py-2.5">
          <Badge color={OUTCOME_COLOR[r.outcome]}>{OUTCOME_LABEL[r.outcome]}</Badge>
          {q?.rejectedReason && <div className="mt-1 max-w-[220px] text-[11px]" style={{ color: WARM }}>{q.rejectedReason}</div>}
        </td>
        <td className={`${mono} px-3 py-2.5 text-right`}>
          {q ? money(q.landedTotal) : '—'}
          {q && <div className="text-[11px] text-faint">{money(q.price)} + {money(q.shipping)}</div>}
        </td>
        <td className="px-3 py-2.5">{q ? <span style={{ color: q.inStock ? OK : FAULT }}>{q.inStock ? 'in stock' : 'out of stock'}</span> : '—'}</td>
        <td className="max-w-[180px] px-3 py-2.5 leading-[1.35]">{q?.eta ?? '—'}</td>
        <td className="px-3 py-2.5">
          {q ? (
            <>
              <span style={{ color: q.identicalPart ? OK : FAULT }}>{q.identicalPart ? 'identical' : 'not identical'}</span>
              {q.partNumberSaid && <div className={`${mono} text-[11px] text-faint`}>{q.partNumberSaid}</div>}
            </>
          ) : '—'}
        </td>
        <td className="px-3 py-2.5 text-muted">{callInfo}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right">
          {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mr-3 text-link hover:text-[#C9D0FF]">Open page</a>}
          {r.transcript.length > 0 && (
            <button onClick={onToggle} className="text-link hover:text-[#C9D0FF]">{open ? 'Hide transcript' : `Transcript (${r.transcript.length})`}</button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line">
          <td colSpan={8} className="px-3 pb-3">
            <div className="flex flex-col gap-1 rounded-[8px] bg-bg p-2.5">
              {r.transcript.map((t, i) => (
                <span key={i} className="text-[12px] leading-[1.45] text-body">
                  <span className={`${mono} mr-1.5 text-[10.5px] text-faint`}>{clock(t.ts)}</span>
                  <span className="text-muted">{t.speaker}:</span> {t.text}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
