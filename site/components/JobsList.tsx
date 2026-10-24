'use client';

import Link from 'next/link';
import { useApi, useEvents } from '@/lib/hooks';
import { money, savings, type Job } from '@/lib/types';
import { StateBadge } from './StateBadge';
import { LiveDot } from './LiveDot';

export function JobsList() {
  const { events, live } = useEvents();
  const { data, error } = useApi<Job[]>('/api/fixie/jobs', events.length);
  const jobs = data ? [...data].sort((a, b) => b.updatedAt - a.updatedAt) : null;

  return (
    <section className="mt-4" aria-live="polite">
      <div className="mb-4"><LiveDot live={live} /></div>
      {error && <p role="alert" className="rounded-card border border-fault/40 bg-fault/10 p-4 text-lg text-fault">Could not reach the Fixie backend: {error}</p>}
      {!jobs && !error && <p className="text-xl text-body">Loading jobs&hellip;</p>}
      {jobs && jobs.length === 0 && <p className="text-xl text-body">No jobs yet. They appear here as soon as someone calls.</p>}
      {jobs && jobs.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-left text-lg text-body">
            <thead className="border-b border-line-strong text-text">
              <tr>
                <th className="p-4 font-semibold">Job</th>
                <th className="p-4 font-semibold">Appliance</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Best price</th>
                <th className="p-4 font-semibold">Saved vs tech visit</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const s = savings(j);
                return (
                  <tr key={j.id} className="border-t border-line hover:bg-surface/60">
                    <td className="p-4">
                      <Link href={`/dashboard/jobs/${j.id}`} className="inline-flex min-h-12 items-center font-semibold text-link underline underline-offset-4">
                        {j.id}
                      </Link>
                      <div className="text-base text-body">{j.customer.name}</div>
                    </td>
                    <td className="p-4">
                      {j.kind === 'enterprise' ? (j.fault?.asset ?? 'Enterprise asset') : (j.appliance ?? 'Not yet identified')}
                      {j.model && <div className="text-base text-muted">{j.model}</div>}
                    </td>
                    <td className="p-4"><StateBadge state={j.state} /></td>
                    <td className="p-4">{j.bestDeal ? money(j.bestDeal.landedTotal) : 'None yet'}</td>
                    <td className="p-4 font-semibold text-text">{s != null ? money(s) : 'None yet'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
