'use client';

import { useMemo } from 'react';
import { newestFirst, orderStats, safeUrl } from './derive';
import type { OrderView, PaymentStatus } from './types';
import { Badge, Empty, FAULT, GREY, OK, Stat, Th, WARM, mono, money, panel, small, stamp, stateColor } from './ui';

const PAY_COLOR: Record<PaymentStatus, string> = { confirmed: OK, placed: OK, declined: FAULT, failed: FAULT };

export function OrdersTab({ orders }: { orders: OrderView[] }) {
  const rows = useMemo(() => newestFirst(orders), [orders]);
  const stats = useMemo(() => orderStats(orders), [orders]);

  if (orders.length === 0)
    return <Empty title="No orders yet." hint="An order appears when a customer says yes to a quote and Fixie places it." />;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Orders" value={stats.count} />
        <Stat label="Total spend" value={money(stats.spend)} />
        <Stat label="Mock / card" value={`${stats.mock} / ${stats.card}`} />
        <Stat label="Declined or failed" value={stats.problems} color={stats.problems ? FAULT : undefined} />
      </div>
      <div className={`${panel} overflow-x-auto p-1.5`}>
        <table className="w-full min-w-[960px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line">
              <Th>Placed</Th>
              <Th>Customer</Th>
              <Th>Part</Th>
              <Th>Supplier</Th>
              <Th right>Landed</Th>
              <Th>ETA</Th>
              <Th>Job</Th>
              <Th>Payment</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const url = safeUrl(o.url);
              const p = o.payment;
              return (
                <tr key={o.jobId} className="border-b border-line align-top last:border-0">
                  <td className={`${mono} whitespace-nowrap px-3 py-2.5 text-[11.5px]`}>{stamp(o.placedAt)}</td>
                  <td className="px-3 py-2.5">
                    <div>{o.customer.name ?? 'Unknown'}</div>
                    <div className={`${mono} text-[11px] text-faint`}>{o.customer.phone}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {o.part ? (
                      <>
                        <div>{o.part.name}</div>
                        <div className={`${mono} text-[11px] text-faint`}>{o.part.partNumber}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-link hover:text-[#C9D0FF]">{o.supplier}</a> : o.supplier}
                    {o.approvedBy && <div className="text-[11px] text-faint">approved by {o.approvedBy}</div>}
                  </td>
                  <td className={`${mono} px-3 py-2.5 text-right`}>
                    {money(o.landedTotal)}
                    <div className="text-[11px] text-faint">{money(o.price)} + {money(o.shipping)}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{o.eta ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <Badge color={stateColor(o.jobState)}>{o.jobState}</Badge>
                    <div className={`${mono} mt-1 text-[11px] text-faint`}>{o.jobId}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge color={p.kind === 'card' ? WARM : GREY}>{p.kind}</Badge>
                      <Badge color={PAY_COLOR[p.status]}>{p.status}</Badge>
                    </div>
                    {(p.orderId || p.last4) && (
                      <div className={`${mono} mt-1 text-[11px] text-faint`}>{[p.orderId, p.last4 && `card ···${p.last4}`].filter(Boolean).join(' · ')}</div>
                    )}
                    {p.reason && <div className="mt-1 max-w-[220px] text-[11px]" style={{ color: FAULT }}>{p.reason}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className={small}>Orders from before the last server restart show as mock/confirmed because payment events are only kept in memory.</span>
    </div>
  );
}
