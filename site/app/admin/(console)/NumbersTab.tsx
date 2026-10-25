'use client';

import { useState } from 'react';
import type { DirectoryEntry, DirectoryKind } from './types';
import { AGENT, Badge, Btn, Empty, FAULT, GREY, OK, Th, WARM, mono, panel, small } from './ui';

export const KIND_COLOR: Record<DirectoryKind, string> = { fixie: AGENT, customer: OK, vendor: WARM, warranty: WARM, tech: '#C8A2FF', test_user: GREY };
const KIND_LABEL: Record<DirectoryKind, string> = { fixie: 'fixie', customer: 'customer', vendor: 'vendor', warranty: 'warranty', tech: 'tech', test_user: 'test user' };

const isMasked = (phone: string) => phone.startsWith('···');

export function NumbersTab({ directory, onText }: { directory: DirectoryEntry[]; onText: (key: string) => void }) {
  const [copied, setCopied] = useState(false);
  const fixie = directory.find((d) => d.kind === 'fixie');
  const rest = directory.filter((d) => d.kind !== 'fixie');

  if (directory.length === 0)
    return <Empty title="No numbers yet." hint="The directory lists Fixie's own line, every customer who has called, and each supplier, warranty and tech number on the roster." />;

  const copy = async () => {
    if (!fixie) return;
    await navigator.clipboard.writeText(fixie.phone).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {fixie && (
        <div className={`${panel} flex flex-wrap items-center justify-between gap-3 p-4`} style={{ boxShadow: `inset 0 0 0 1px ${AGENT}33` }}>
          <div className="flex flex-col gap-1">
            <span className={small}>Fixie&rsquo;s own line</span>
            <span className={`${mono} text-[22px] font-light tracking-[-0.01em]`}>{fixie.phone}</span>
            <span className={small}>Customers call or text this number.</span>
          </div>
          <Btn
            disabled={isMasked(fixie.phone)}
            title={isMasked(fixie.phone) ? 'Turn on "Show full numbers" to copy' : undefined}
            onClick={copy}
          >
            {copied ? 'Copied' : 'Copy number'}
          </Btn>
        </div>
      )}
      <div className={`${panel} overflow-x-auto p-1.5`}>
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line">
              <Th>Type</Th>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Lane</Th>
              <Th>Mode</Th>
              <Th right>Jobs</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rest.map((d) => (
              <tr key={d.key} className="border-b border-line last:border-0">
                <td className="px-3 py-2"><Badge color={KIND_COLOR[d.kind]}>{KIND_LABEL[d.kind]}</Badge></td>
                <td className="px-3 py-2">{d.name}</td>
                <td className={`${mono} px-3 py-2`}>{d.phone}</td>
                <td className="px-3 py-2 text-muted">{d.lane ?? '—'}</td>
                <td className="px-3 py-2">{d.mode ? <Badge color={d.mode === 'live' ? FAULT : AGENT}>{d.mode}</Badge> : <span className="text-faint">—</span>}</td>
                <td className={`${mono} px-3 py-2 text-right`}>{d.jobIds.length}</td>
                <td className="px-3 py-1.5 text-right">{d.textable && <Btn onClick={() => onText(d.key)}>Text</Btn>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
