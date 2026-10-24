import { inspect } from 'node:util';
import type { Job, Quote } from '../types.ts';

export type Cents = number & { readonly __brand: 'cents' };
export const toCents = (usd: number): Cents => Math.round(usd * 100) as Cents;

/**
 * Full card credentials. The PAN only ever lives in this object's private fields: JSON, util.inspect,
 * template strings and console.log all print "[card redacted]". Read it only through `use()`, and only
 * to hand it straight to a checkout API.
 */
export class CardSecret {
  readonly #pan: string;
  readonly #cvv: string;
  readonly #expMonth: string;
  readonly #expYear: string;
  constructor(pan: string, cvv: string, expMonth: string, expYear: string) {
    this.#pan = pan;
    this.#cvv = cvv;
    this.#expMonth = expMonth;
    this.#expYear = expYear;
  }
  use<T>(fn: (c: { pan: string; cvv: string; expMonth: string; expYear: string }) => T): T {
    return fn({ pan: this.#pan, cvv: this.#cvv, expMonth: this.#expMonth, expYear: this.#expYear });
  }
  toJSON(): string {
    return '[card redacted]';
  }
  toString(): string {
    return '[card redacted]';
  }
  [inspect.custom](): string {
    return '[card redacted]';
  }
}

export type CardLock = 'merchant_locked' | 'single_use';

export interface IssuedCard {
  issuer: string;
  cardId: string;
  last4: string;
  /** Enforced by the issuer on every authorization; nothing in Fixie can raise it. */
  limitCents: Cents;
  lock: CardLock;
  secret: CardSecret;
}

export interface Issuer {
  readonly name: string;
  issue(req: { limitCents: Cents; memo: string; idempotencyKey: string }): Promise<IssuedCard>;
  close(cardId: string): Promise<void>;
}

export type CheckoutResult =
  | { status: 'placed'; orderId: string; chargedCents: Cents }
  | { status: 'declined'; reason: string };

export interface Merchant {
  readonly id: string;
  readonly name: string;
  readonly sandbox: boolean;
  checkout(req: { partNumber: string; qty: number; totalCents: Cents; card: IssuedCard; idempotencyKey: string }): Promise<CheckoutResult>;
}

export type ApprovedBy = 'user_voice' | 'caregiver';

export interface OrderRequest {
  job: Job;
  quote: Quote;
  approvedBy: ApprovedBy;
}

export interface OrderResult {
  orderId: string | null;
  merchant: string;
  total: number;
  last4: string;
  status: 'placed' | 'declined';
  reason?: string;
}
