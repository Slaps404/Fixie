import type { CustomerView, MessageView, OrderView, PartyKind, ResponseOutcome, ResponseView } from './types';

export function searchCustomers(customers: CustomerView[], query: string): CustomerView[] {
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  return customers
    .filter((c) => {
      if (!q) return true;
      const text = `${c.name ?? ''} ${c.appliances.map((a) => `${a.appliance} ${a.model}`).join(' ')}`.toLowerCase();
      return text.includes(q) || (digits.length > 0 && c.phone.replace(/\D/g, '').includes(digits));
    })
    .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
}

export type ResponseGroup = { key: string; jobId: string; partNumber: string | null; items: ResponseView[]; latestAt: number };

// Within a group the chosen response leads, then quotes by landed total, then everything else newest first.
const rank = (r: ResponseView) => (r.chosen ? 0 : r.quote && !r.quote.rejectedReason ? 1 : 2);

export function groupResponses(responses: ResponseView[]): ResponseGroup[] {
  const groups = new Map<string, ResponseGroup>();
  for (const r of responses) {
    const key = `${r.jobId}|${r.partNumber ?? ''}`;
    const g = groups.get(key) ?? { key, jobId: r.jobId, partNumber: r.partNumber, items: [], latestAt: 0 };
    g.items.push(r);
    g.latestAt = Math.max(g.latestAt, r.at);
    groups.set(key, g);
  }
  for (const g of groups.values())
    g.items.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? a.quote!.landedTotal - b.quote!.landedTotal : b.at - a.at));
  return [...groups.values()].sort((a, b) => b.latestAt - a.latestAt);
}

export const OUTCOME_LABEL: Record<ResponseOutcome, string> = { quoted: 'quoted', rejected: 'rejected', no_quote: 'no quote', in_progress: 'in progress' };

export type Thread = { key: string; partyKey: string | null; name: string; kind: PartyKind; phone: string; messages: MessageView[]; last: MessageView };

export function buildThreads(messages: MessageView[]): Thread[] {
  const map = new Map<string, Thread>();
  for (const m of [...messages].sort((a, b) => a.at - b.at)) {
    const key = m.party.key ?? `phone:${m.phone}`;
    const t = map.get(key) ?? { key, partyKey: m.party.key, name: m.party.name ?? m.phone, kind: m.party.kind, phone: m.phone, messages: [], last: m };
    t.messages.push(m);
    t.last = m;
    if (m.party.name) t.name = m.party.name;
    map.set(key, t);
  }
  return [...map.values()].sort((a, b) => b.last.at - a.last.at);
}

export function orderStats(orders: OrderView[]) {
  const spent = orders.filter((o) => o.payment.status === 'confirmed' || o.payment.status === 'placed');
  return {
    count: orders.length,
    spend: spent.reduce((s, o) => s + o.landedTotal, 0),
    mock: orders.filter((o) => o.payment.kind === 'mock').length,
    card: orders.filter((o) => o.payment.kind === 'card').length,
    problems: orders.filter((o) => o.payment.status === 'declined' || o.payment.status === 'failed').length,
  };
}

export const newestFirst = <T extends { placedAt: number }>(orders: T[]): T[] => [...orders].sort((a, b) => b.placedAt - a.placedAt);

// Only http(s) links from supplier data become clickable.
export const safeUrl = (u: string | null): string | null => (u && /^https?:\/\//i.test(u) ? u : null);

export function customerNameByJob(customers: CustomerView[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of customers) for (const j of c.jobs) if (c.name) map.set(j.jobId, c.name);
  return map;
}
