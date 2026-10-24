import 'server-only';

const key = () => process.env.STRIPE_SECRET_KEY;
const price = () => process.env.STRIPE_PRICE_ID;

export const stripeConfigured = () => Boolean(key() && price());

async function stripe<T>(path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${key()}`,
      ...(init.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: init.form ? new URLSearchParams(init.form) : undefined,
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Stripe request failed');
  return json as T;
}

/** Stripe Checkout in subscription mode. The phone number rides along so we can check it on return. */
export async function createCheckout(phone: string, origin: string): Promise<string> {
  const s = await stripe<{ url: string }>('checkout/sessions', {
    method: 'POST',
    form: {
      mode: 'subscription',
      'line_items[0][price]': price()!,
      'line_items[0][quantity]': '1',
      client_reference_id: phone,
      'metadata[phone]': phone,
      success_url: `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/get-started?card=1`,
    },
  });
  return s.url;
}

/** True only when this Checkout session is complete and was started for this phone number. */
export async function checkoutPaidFor(sessionId: string, phone: string): Promise<boolean> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
  const s = await stripe<{ status: string; payment_status: string; metadata?: { phone?: string } }>(`checkout/sessions/${sessionId}`);
  return s.status === 'complete' && s.payment_status !== 'unpaid' && s.metadata?.phone === phone;
}
