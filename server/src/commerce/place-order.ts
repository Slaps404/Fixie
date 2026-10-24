// Turns a spoken "order it" into a real order: issue a virtual card capped at the approved landed total,
// then check out with it. The cap and the merchant lock live at the card issuer, so a wrong price or a
// hallucinated second purchase is declined by the network, not by a prompt.
import { emit as defaultEmit } from '../events.ts';
import { defaultDeps } from './providers.ts';
import { toCents, type Issuer, type Merchant, type OrderRequest, type OrderResult } from './types.ts';

export interface CommerceDeps {
  issuer: Issuer;
  merchantFor(req: OrderRequest): Merchant;
  emit: typeof defaultEmit;
}

const inflight = new Map<string, Promise<OrderResult>>();
/** jobId → cards issued for it, so the kill switch can close them at the issuer. */
const cardsByJob = new Map<string, Array<{ issuer: Issuer; cardId: string; last4: string }>>();

/** Never rejects: refusals and issuer/network errors resolve as status 'failed' and emit error{where:'placeOrder'}. */
export function placeOrder(req: OrderRequest, deps?: CommerceDeps): Promise<OrderResult> {
  const { job, quote, approvedBy } = req;
  const key = `fixie-${job.id}-${quote.vendorId}-${quote.callId}`;
  const hit = inflight.get(key);
  if (hit) return hit;
  const p = attempt(req, key, deps);
  inflight.set(key, p);
  void p.then((r) => r.status === 'failed' && inflight.delete(key));
  return p;
}

async function attempt(req: OrderRequest, key: string, given?: CommerceDeps): Promise<OrderResult> {
  const { job, quote, approvedBy } = req;
  const fail = (reason: string, last4: string | null = null): OrderResult => {
    (given?.emit ?? defaultEmit)(job.id, 'error', { where: 'placeOrder', merchant: quote.supplier, last4, detail: `${reason} The order stays a mock order; nothing was charged.` });
    return { orderId: null, merchant: quote.supplier, total: quote.landedTotal, last4, status: 'failed', reason };
  };
  if (approvedBy !== 'user_voice' && approvedBy !== 'caregiver') return fail(`Refused: needs a human approval, got ${String(approvedBy)}.`);
  if (quote.rejectedReason || !quote.identicalPart || !quote.inStock || !(quote.landedTotal > 0)) {
    return fail(`Refused quote from ${quote.supplier}: ${quote.rejectedReason ?? 'not an in-stock identical part'}.`);
  }
  if (!job.part?.partNumber) return fail(`Refused: job ${job.id} has no part to order.`);
  let deps: CommerceDeps;
  try {
    deps = given ?? defaultDeps();
  } catch (err) {
    return fail(`${(err as Error).message}.`);
  }
  let card: { cardId: string; last4: string } | undefined;
  try {
    return await run(req, key, deps, (c) => (card = c));
  } catch (err) {
    if (card) await deps.issuer.close(card.cardId).catch(() => {});
    return fail(`${deps.issuer.name} error: ${(err as Error).message.slice(0, 200)}${card ? ` Card ···${card.last4} closed.` : ''}`, card?.last4 ?? null);
  }
}

async function run({ job, quote, approvedBy }: OrderRequest, key: string, deps: CommerceDeps, onCard: (c: { cardId: string; last4: string }) => void): Promise<OrderResult> {
  const merchant = deps.merchantFor({ job, quote, approvedBy });
  const limitCents = toCents(quote.landedTotal);
  const card = await deps.issuer.issue({ limitCents, memo: `Fixie ${job.id} ${job.part!.partNumber}`, idempotencyKey: key });
  onCard(card);
  const sim = merchant.sandbox ? { simulated: true } : {};
  cardsByJob.set(job.id, [...(cardsByJob.get(job.id) ?? []), { issuer: deps.issuer, cardId: card.cardId, last4: card.last4 }]);
  deps.emit(job.id, 'vcc_issued', {
    issuer: card.issuer,
    last4: card.last4,
    limit: limitCents / 100,
    lock: card.lock,
    approvedBy,
    reason: `Virtual card capped at $${(limitCents / 100).toFixed(2)} by ${card.issuer}, ${card.lock === 'merchant_locked' ? 'locked to the first merchant that charges it' : 'closes after one charge'}`,
  }, sim);

  const out = await merchant.checkout({ partNumber: job.part!.partNumber, qty: 1, totalCents: limitCents, card, idempotencyKey: key });
  if (out.status === 'declined') {
    await deps.issuer.close(card.cardId).catch(() => {});
    deps.emit(job.id, 'error', { where: 'placeOrder', merchant: merchant.name, last4: card.last4, detail: `Checkout declined: ${out.reason}. Card closed.` }, sim);
    return { orderId: null, merchant: merchant.name, total: limitCents / 100, last4: card.last4, status: 'declined', reason: out.reason };
  }
  const result: OrderResult = { orderId: out.orderId, merchant: merchant.name, total: out.chargedCents / 100, last4: card.last4, status: 'placed' };
  deps.emit(job.id, 'order_placed', {
    ...result,
    partNumber: job.part!.partNumber,
    approvedBy,
    sandbox: merchant.sandbox,
    ...(quote.url ? { url: quote.url } : {}),
    reason: `Paid $${result.total.toFixed(2)} with virtual card ···${card.last4}; ${approvedBy === 'caregiver' ? 'caregiver' : 'caller'} said yes by voice`,
  }, sim);
  return result;
}

/** Kill switch: close every card issued for this job, so the issuer declines any later charge. Returns the last4s closed. */
export async function revokeCards(jobId: string): Promise<string[]> {
  const cards = cardsByJob.get(jobId) ?? [];
  cardsByJob.delete(jobId);
  await Promise.all(cards.map((c) => c.issuer.close(c.cardId)));
  return cards.map((c) => c.last4);
}

/** Test hook: forget idempotency and card state between cases. */
export function resetOrders(): void {
  inflight.clear();
  cardsByJob.clear();
}
