// Store a card in the encrypted vault and print its token. The number is read from stdin, never from argv,
// so it stays out of shell history and `ps`. Usage: npm run vault:put   then paste: 4242424242424242 12/30 123
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { createVault } from '../src/commerce/vault.ts';

const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
process.stderr.write('Card as "PAN MM/YY CVC" (tonight only 4242 4242 4242 4242): ');
const line = (await rl.question('')).trim();
rl.close();
const m = /^([\d\s-]{13,23})\s+(\d{1,2})\/(\d{2,4})\s+(\d{3,4})$/.exec(line);
if (!m) {
  console.error('expected "PAN MM/YY CVC"');
  process.exit(1);
}
const { token, last4 } = createVault().put({ pan: m[1], expMonth: m[2], expYear: m[3], cvc: m[4] });
console.log(`stored card ···${last4}. Add to server/.env:\nORDER_CARD_TOKEN=${token}`);
