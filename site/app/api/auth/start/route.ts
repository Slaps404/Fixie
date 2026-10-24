import { toE164 } from '@/lib/phone';
import { clientIp, tooMany } from '@/lib/rate';
import { sendCode, smsConfigured, testMode, TEST_CODE } from '@/lib/twilio';

export async function POST(req: Request) {
  const { phone: raw } = (await req.json().catch(() => ({}))) as { phone?: string };
  const phone = toE164(String(raw ?? ''));
  if (!phone) return Response.json({ error: 'Enter your 10-digit phone number.' }, { status: 400 });
  if (tooMany(`start:${phone}`, 3, 10 * 60_000) || tooMany(`start-ip:${clientIp(req)}`, 10, 10 * 60_000)) {
    return Response.json({ error: 'Too many tries. Please wait a few minutes.' }, { status: 429 });
  }
  const sent = await sendCode(phone);
  if (!sent.ok) return Response.json({ error: sent.error }, { status: 502 });
  const simulated = !smsConfigured() && testMode();
  return Response.json({ phone, simulated, ...(simulated ? { testCode: TEST_CODE } : {}) });
}
