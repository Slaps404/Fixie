// Read models for the admin panel: customers, directory, responses, orders, messages. Every phone goes through `show`.
import { config } from '../config.ts';
import { calls } from '../calls.ts';
import { partyName } from '../dialer.ts';
import { eventsFor, maskPhone } from '../events.ts';
import { jobs } from '../jobs.ts';
import { whatsappEnabled } from '../notify/whatsapp.ts';
import type { FixieEvent, Job, JobState, Quote } from '../types.ts';
import { twilioConfigured } from '../vision/twilio.ts';
import { type Customer, type DirEntry, type Directory } from './directory.ts';
import { type StoredMessage, listMessages } from './messages.ts';
import { type TLine, redact, transcriptFor } from './observe.ts';

export type Show = (phone: string | undefined | null) => string;
export const showFor = (reveal: boolean): Show => (p) => (reveal ? (p ?? '') : maskPhone(p ?? ''));

export const customerView = (c: Customer, show: Show) => ({ ...c, phone: show(c.phone), notes: c.notes.map(redact) });
// Fixie's own line is public (it's on the landing page), so it is never masked.
export const directoryView = (e: DirEntry, show: Show) => ({ ...e, phone: e.kind === 'fixie' ? e.phone : show(e.phone) });

export function channels() {
  return {
    whatsapp: whatsappEnabled(),
    sms: twilioConfigured() && Boolean(process.env.TWILIO_PHONE_NUMBER ?? process.env.TWILIO_FROM_NUMBER),
    dryRun: config.dryRun,
  };
}

// ---------- responses (supplier / warranty calls and online quotes) ----------
const quoteView = (q: Quote) => ({
  price: q.price,
  shipping: q.shipping,
  landedTotal: q.landedTotal,
  inStock: q.inStock,
  eta: q.eta,
  identicalPart: q.identicalPart,
  rejectedReason: q.rejectedReason ?? null,
  url: q.url ?? null,
  partNumberSaid: q.partNumberSaid ?? null,
});

type Outcome = 'quoted' | 'rejected' | 'no_quote' | 'in_progress';

function callOutcome(job: Job, callId: string, lane: string, quote: Quote | undefined, ended: boolean): Outcome {
  if (quote) return quote.rejectedReason ? 'rejected' : 'quoted';
  if (!ended) return 'in_progress';
  // A warranty call records a coverage answer rather than a quote.
  return lane === 'warranty' && (job.warranty || calls.get(callId)?.quoted) ? 'quoted' : 'no_quote';
}

export function responsesView() {
  const out = [];
  for (const job of jobs.all()) {
    const partNumber = job.part?.partNumber ?? null;
    for (const rec of job.calls) {
      if (rec.lane !== 'supplier' && rec.lane !== 'warranty') continue;
      const quote = job.quotes.filter((q) => q.callId === rec.callId && q.source !== 'online').at(-1);
      const ended = rec.endedAt !== undefined || rec.endedReason !== undefined || calls.get(rec.callId)?.state === 'ended';
      out.push({
        id: rec.callId,
        jobId: job.id,
        partNumber,
        vendorId: rec.vendorId ?? null,
        supplier: partyName(job, rec.lane, rec.vendorId),
        lane: rec.lane,
        channel: 'phone' as const,
        at: rec.startedAt,
        outcome: callOutcome(job, rec.callId, rec.lane, quote, ended),
        endedReason: rec.endedReason ?? null,
        durationSec: rec.durationSec ?? null,
        quote: quote ? quoteView(quote) : null,
        chosen: Boolean(quote && job.bestDeal?.callId === rec.callId),
        transcript: transcriptFor(rec.callId),
      });
    }
    for (const q of job.quotes) {
      if (q.source !== 'online') continue;
      out.push({
        id: `online:${job.id}:${q.vendorId}`,
        jobId: job.id,
        partNumber,
        vendorId: q.vendorId,
        supplier: q.supplier,
        lane: 'supplier' as const,
        channel: 'online' as const,
        at: job.updatedAt,
        outcome: (q.rejectedReason ? 'rejected' : 'quoted') as Outcome,
        endedReason: null,
        durationSec: null,
        quote: quoteView(q),
        chosen: job.bestDeal?.source === 'online' && job.bestDeal.vendorId === q.vendorId,
        transcript: [] as TLine[],
      });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

// ---------- orders ----------
const ORDERED_STATES: JobState[] = ['ORDERED', 'DELIVERED', 'INSTALLING', 'FIXED', 'NOTIFIED'];

type Payment = { kind: 'mock' | 'card'; status: 'confirmed' | 'placed' | 'declined' | 'failed'; orderId: string | null; last4: string | null; reason: string | null };

/** Payment facts only survive in this process's event history. After a restart an order reads as a confirmed mock. */
function paymentFrom(events: FixieEvent[]): { payment: Payment; confirmed?: FixieEvent } {
  const last = (type: FixieEvent['type']) => events.filter((e) => e.type === type).at(-1);
  const confirmed = last('order_confirmed');
  const placed = last('order_placed');
  const failure = events.filter((e) => e.type === 'error' && e.data.where === 'placeOrder').at(-1);
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  if (placed) {
    return { confirmed, payment: { kind: 'card', status: 'placed', orderId: str(placed.data.orderId), last4: str(placed.data.last4), reason: null } };
  }
  if (failure) {
    const detail = str(failure.data.detail);
    const declined = /declined/i.test(detail ?? '');
    return { confirmed, payment: { kind: 'card', status: declined ? 'declined' : 'failed', orderId: null, last4: str(failure.data.last4), reason: detail ? redact(detail) : null } };
  }
  const card = confirmed?.data.mockOrder === false;
  return { confirmed, payment: { kind: card ? 'card' : 'mock', status: 'confirmed', orderId: null, last4: null, reason: null } };
}

export function ordersView(dir: Directory, show: Show) {
  const out = [];
  for (const job of jobs.all()) {
    const deal = job.bestDeal;
    if (!deal || !ORDERED_STATES.includes(job.state)) continue;
    const { payment, confirmed } = paymentFrom(eventsFor(job.id));
    const party = dir.byPhone(job.customer.phone);
    out.push({
      jobId: job.id,
      customer: { key: party?.key ?? '', name: job.customer.name || party?.name || null, phone: show(job.customer.phone) },
      jobState: job.state,
      part: job.part ? { partNumber: job.part.partNumber, name: job.part.name } : null,
      supplier: deal.supplier,
      url: deal.url ?? (typeof confirmed?.data.url === 'string' ? confirmed.data.url : null),
      price: deal.price,
      shipping: deal.shipping,
      landedTotal: deal.landedTotal,
      eta: deal.eta,
      placedAt: confirmed ? Date.parse(confirmed.ts) : job.updatedAt,
      approvedBy: typeof confirmed?.data.approvedBy === 'string' ? confirmed.data.approvedBy : null,
      payment,
    });
  }
  return out.sort((a, b) => b.placedAt - a.placedAt);
}

// ---------- messages ----------
export function messageView(m: StoredMessage, dir: Directory, show: Show) {
  const entry = dir.byPhone(m.phone);
  const kind = !entry || entry.kind === 'fixie' ? 'unknown' : entry.kind === 'test_user' ? 'customer' : entry.kind;
  return {
    id: m.id,
    at: m.at,
    direction: m.direction,
    channel: m.channel,
    phone: show(m.phone),
    party: { key: entry?.key ?? null, name: entry?.name ?? null, kind },
    body: redact(m.body),
    status: m.status,
    reason: m.reason ? redact(m.reason) : null,
    source: m.source,
    jobId: m.jobId,
  };
}

export const messagesView = (dir: Directory, show: Show) => listMessages().reverse().map((m) => messageView(m, dir, show));
