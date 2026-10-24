// Lithic virtual cards (sandbox by default). Card creation and authorization simulation are plain REST.
// The PAN comes back from POST /v1/cards and goes straight into a CardSecret; it is never logged or emitted.
import { CardSecret, type Cents, type CheckoutResult, type IssuedCard, type Issuer, type Merchant } from './types.ts';
import type { Quote } from '../types.ts';

const BASE = (process.env.LITHIC_BASE_URL || 'https://sandbox.lithic.com').replace(/\/$/, '');
const SANDBOX = BASE.includes('sandbox');

async function lithic<T>(key: string, method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = { Authorization: key, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (res.status !== 429 || attempt >= 4) break;
    const wait = Math.min(8, Number(res.headers.get('retry-after')) || 1 + attempt);
    await res.text();
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Lithic ${method} ${path} → ${res.status}: ${text.replace(/\d{12,19}/g, '[digits]').slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

interface LithicCard {
  token: string;
  last_four: string;
  pan?: string;
  cvv?: string;
  exp_month?: string;
  exp_year?: string;
  state: string;
}

export function lithicIssuer(key: string, type: 'MERCHANT_LOCKED' | 'SINGLE_USE' = (process.env.LITHIC_CARD_TYPE as 'SINGLE_USE') || 'MERCHANT_LOCKED'): Issuer {
  return {
    name: SANDBOX ? 'Lithic sandbox' : 'Lithic',
    async issue({ limitCents, memo, idempotencyKey }): Promise<IssuedCard> {
      const c = await lithic<LithicCard>(key, 'POST', '/v1/cards', {
        type,
        memo,
        spend_limit: limitCents,
        spend_limit_duration: type === 'SINGLE_USE' ? 'TRANSACTION' : 'FOREVER',
        state: 'OPEN',
      }, idempotencyKey);
      if (!c.pan) throw new Error('Lithic returned no PAN (production PAN access needs PCI scope; use an embedded/hosted card flow)');
      return {
        issuer: this.name, cardId: c.token, last4: c.last_four, limitCents, lock: type === 'SINGLE_USE' ? 'single_use' : 'merchant_locked',
        secret: new CardSecret(c.pan, c.cvv ?? '', c.exp_month ?? '', c.exp_year ?? ''),
      };
    },
    async close(cardId) {
      await lithic(key, 'PATCH', `/v1/cards/${encodeURIComponent(cardId)}`, { state: 'CLOSED' });
    },
  };
}

interface SimAuth {
  token: string;
}
interface LithicTxn {
  token: string;
  status: string;
  result: string;
  amount?: number;
}

/** Card-statement descriptors the big online stores charge under, so the simulated auth looks like theirs. */
const ONLINE_DESCRIPTORS: Record<string, string> = {
  'online:amazon': 'AMAZON MKTPL',
  'online:walmart': 'WALMART.COM',
  'online:ebay': 'EBAY O',
  'online:homedepot': 'HOMEDEPOT.COM',
  'online:repairclinic': 'REPAIRCLINIC.COM',
  'online:partselect': 'PARTSELECT.COM',
  'online:appliancepartspros': 'APPLIANCEPARTSPROS',
  'online:searspartsdirect': 'SEARS PARTSDIRECT',
};

/**
 * Sandbox stand-in for the supplier's card terminal: Lithic's authorization simulator charges the card at a
 * descriptor for this supplier, and Lithic's real auth engine approves or declines against the cap and lock.
 */
export function lithicSimulatedMerchant(key: string, quote: Quote): Merchant {
  const descriptor = ONLINE_DESCRIPTORS[quote.vendorId] ?? (quote.supplier.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 22) || 'FIXIE SUPPLIER');
  return {
    id: `lithic-sim:${quote.vendorId}`,
    name: quote.supplier,
    sandbox: true,
    async checkout({ totalCents, card }): Promise<CheckoutResult> {
      return chargeSimulated(key, card, totalCents, descriptor, quote.vendorId);
    },
  };
}

export async function chargeSimulated(key: string, card: IssuedCard, amount: Cents, descriptor: string, acceptorId: string): Promise<CheckoutResult> {
  if (!SANDBOX) throw new Error('simulated charges only exist in the Lithic sandbox');
  const auth = await card.secret.use(({ pan }) =>
    lithic<SimAuth>(key, 'POST', '/v1/simulate/authorize', { pan, amount, descriptor, mcc: '5722', merchant_acceptor_id: acceptorId.replace(/^online:/, '').slice(0, 15) }),
  );
  const txn = await transactionWhenVisible(key, auth.token);
  if (txn.result === 'APPROVED') return { status: 'placed', orderId: `lithic_${txn.token}`, chargedCents: amount };
  return { status: 'declined', reason: `${txn.result} (${txn.status})` };
}

/** The sandbox returns the auth token before the transaction is readable; poll briefly instead of failing on the first 404. */
async function transactionWhenVisible(key: string, token: string): Promise<LithicTxn> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await lithic<LithicTxn>(key, 'GET', `/v1/transactions/${encodeURIComponent(token)}`);
    } catch (err) {
      if (attempt >= 8 || !/→ 404/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
}
