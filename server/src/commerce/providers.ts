// Default wiring: Lithic sandbox for the card, with the merchant charge simulated through Lithic's own
// authorization simulator, so the cap and merchant lock are enforced by Lithic's auth engine.
import { emit } from '../events.ts';
import type { CommerceDeps } from './place-order.ts';
import { lithicIssuer, lithicSimulatedMerchant } from './lithic.ts';

export function defaultDeps(): CommerceDeps {
  const key = process.env.LITHIC_API_KEY;
  if (!key) throw new Error('LITHIC_API_KEY is not set; see docs/issues/16-real-ordering.md for the keys to create');
  const issuer = lithicIssuer(key);
  return { issuer, merchantFor: (req) => lithicSimulatedMerchant(key, req.quote), emit };
}
