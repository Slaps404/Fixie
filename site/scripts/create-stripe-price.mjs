// Creates a test-mode "Fixie Family Plan" ($9/mo) product and price, then prints the price id.
// Usage: npm run stripe:create   (reads STRIPE_SECRET_KEY from the repo-root .env or the environment; use an sk_test_ key)
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(new URL('../..', import.meta.url).pathname);

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Set STRIPE_SECRET_KEY (an sk_test_ key) in the repo-root .env first.');
  process.exit(1);
}
if (!key.startsWith('sk_test_')) {
  console.error('This script only runs against a test-mode key (sk_test_...).');
  process.exit(1);
}

async function stripe(path, form) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`Stripe said no (${res.status}): ${json.error?.message ?? 'unknown error'}`);
    process.exit(1);
  }
  return json;
}

const product = await stripe('products', { name: 'Fixie Family Plan' });
const price = await stripe('prices', {
  product: product.id,
  unit_amount: '900',
  currency: 'usd',
  'recurring[interval]': 'month',
});
console.log('Created "Fixie Family Plan" at $9/month (test mode).');
console.log(`Add this line to the repo-root .env:\nSTRIPE_PRICE_ID=${price.id}`);
