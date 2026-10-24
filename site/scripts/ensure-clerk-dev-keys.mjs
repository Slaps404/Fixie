// Zero-config Clerk: if no Clerk keys are configured, ask Clerk for a temporary
// "accountless" dev instance (no account needed) and write its keys to
// .env.local (gitignored). This is the same mechanism `npx clerk init` uses.
// The instance can be claimed later into a real Clerk account:
//   npm run clerk:claim     (prints the claim URL)
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const ENV_FILE = '.env.local';
const CLAIM_FILE = '.clerk-claim-url';

if (process.argv.includes('--claim')) {
  console.log(existsSync(CLAIM_FILE) ? readFileSync(CLAIM_FILE, 'utf8').trim() : 'No temporary Clerk instance was created by this script. Nothing to claim.');
  process.exit(0);
}

const fileText = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
const has = (name) => process.env[name] || new RegExp(`^${name}=\\S+`, 'm').test(fileText);

if (has('CLERK_SECRET_KEY') && has('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')) process.exit(0);

try {
  const r = await fetch('https://api.clerk.com/v1/accountless_applications', { method: 'POST', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const app = await r.json();
  const block = [
    '',
    '# Temporary Clerk dev instance (auto-created, unclaimed). Do not commit.',
    `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${app.publishable_key}`,
    `CLERK_SECRET_KEY=${app.secret_key}`,
    '',
  ].join('\n');
  if (fileText) appendFileSync(ENV_FILE, block); else writeFileSync(ENV_FILE, block.trimStart(), { mode: 0o600 });
  writeFileSync(CLAIM_FILE, `${app.claim_url}\n`, { mode: 0o600 });
  console.log('Clerk: created a temporary dev instance (keys in .env.local).');
  console.log('Clerk: to keep it, run `npm run clerk:claim` and open the URL it prints.');
} catch (e) {
  console.warn(`Clerk: could not create a temporary dev instance (${e.message}).`);
  console.warn('Clerk: set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env.local (see .env.example).');
}
