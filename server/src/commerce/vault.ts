// Card vault: AES-256-GCM at rest, key from CARD_ENC_KEY (32 bytes, base64). Callers get a token and last4;
// the PAN comes back out only through revealForCall(), as a CardSecret that never serializes.
// Tonight only the Stripe test card is accepted unless ALLOW_REAL_CARDS=1.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../config.ts';
import { CardSecret } from './types.ts';

const TEST_PANS = new Set(['4242424242424242']);

export interface CardInput {
  pan: string;
  expMonth: string;
  expYear: string;
  cvc: string;
}

interface Sealed {
  last4: string;
  createdAt: string;
  iv: string;
  tag: string;
  ct: string;
}

export class VaultError extends Error {}

const digits = (s: string) => s.replace(/[\s-]/g, '');

function luhn(pan: string): boolean {
  let sum = 0;
  for (let i = 0; i < pan.length; i++) {
    let d = Number(pan[pan.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

function keyFromEnv(): Buffer {
  const raw = process.env.CARD_ENC_KEY;
  if (!raw) throw new VaultError('CARD_ENC_KEY is not set (32 random bytes, base64: `openssl rand -base64 32`)');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new VaultError(`CARD_ENC_KEY must decode to 32 bytes, got ${key.length}`);
  return key;
}

export function createVault(file = process.env.VAULT_FILE || join(DATA_DIR, 'vault.json')) {
  const load = (): Record<string, Sealed> => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, Sealed>) : {});
  const save = (all: Record<string, Sealed>) => {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
    renameSync(tmp, file);
    chmodSync(file, 0o600);
  };

  return {
    /** Validates, encrypts, stores. Returns only the token and last4. */
    put(card: CardInput): { token: string; last4: string } {
      const pan = digits(card.pan);
      if (!/^\d{13,19}$/.test(pan) || !luhn(pan)) throw new VaultError('not a valid card number');
      if (!TEST_PANS.has(pan) && process.env.ALLOW_REAL_CARDS !== '1') {
        throw new VaultError('only the Stripe test card 4242 4242 4242 4242 is accepted (set ALLOW_REAL_CARDS=1 to allow real cards)');
      }
      const mm = card.expMonth.padStart(2, '0');
      const yyyy = card.expYear.length === 2 ? `20${card.expYear}` : card.expYear;
      if (!/^(0[1-9]|1[0-2])$/.test(mm) || !/^\d{4}$/.test(yyyy)) throw new VaultError('bad expiry');
      const now = new Date();
      if (Number(yyyy) * 12 + Number(mm) < now.getUTCFullYear() * 12 + now.getUTCMonth() + 1) throw new VaultError('card is expired');
      if (!/^\d{3,4}$/.test(card.cvc)) throw new VaultError('bad CVC');

      const token = `card_${randomBytes(12).toString('hex')}`;
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keyFromEnv(), iv);
      cipher.setAAD(Buffer.from(token));
      const ct = Buffer.concat([cipher.update(JSON.stringify({ pan, cvc: card.cvc, expMonth: mm, expYear: yyyy })), cipher.final()]);
      const all = load();
      all[token] = { last4: pan.slice(-4), createdAt: now.toISOString(), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
      save(all);
      return { token, last4: pan.slice(-4) };
    },

    last4(token: string): string | null {
      return load()[token]?.last4 ?? null;
    },

    /** The only way back to the PAN. Use it only inside the order-call card release (commerce/order-call.ts). */
    revealForCall(token: string): CardSecret {
      const s = load()[token];
      if (!s) throw new VaultError('unknown card token');
      const decipher = createDecipheriv('aes-256-gcm', keyFromEnv(), Buffer.from(s.iv, 'base64'));
      decipher.setAAD(Buffer.from(token));
      decipher.setAuthTag(Buffer.from(s.tag, 'base64'));
      const c = JSON.parse(Buffer.concat([decipher.update(Buffer.from(s.ct, 'base64')), decipher.final()]).toString('utf8')) as { pan: string; cvc: string; expMonth: string; expYear: string };
      return new CardSecret(c.pan, c.cvc, c.expMonth, c.expYear);
    },

    remove(token: string): boolean {
      const all = load();
      if (!all[token]) return false;
      delete all[token];
      save(all);
      return true;
    },
  };
}

export type Vault = ReturnType<typeof createVault>;
