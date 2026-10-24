import { originOf } from '@/lib/rate';
import { getSession } from '@/lib/session';
import { createCheckout, stripeConfigured } from '@/lib/stripe';
import { testMode } from '@/lib/twilio';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Please verify your phone number first.' }, { status: 401 });
  if (!stripeConfigured()) {
    if (!testMode()) return Response.json({ error: 'Card payments are not set up yet.' }, { status: 503 });
    return Response.json({ url: '/welcome?test=1', simulated: true });
  }
  try {
    return Response.json({ url: await createCheckout(session.phone, originOf(req)) });
  } catch {
    return Response.json({ error: 'We could not open the card page. Please try again.' }, { status: 502 });
  }
}
