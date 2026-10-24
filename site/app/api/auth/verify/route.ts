import { toE164 } from '@/lib/phone';
import { clientIp, tooMany } from '@/lib/rate';
import { startSession } from '@/lib/session';
import { checkCode } from '@/lib/twilio';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string; code?: string };
  const phone = toE164(String(body.phone ?? ''));
  const code = String(body.code ?? '').replace(/\D/g, '');
  if (!phone || code.length < 4 || code.length > 10) {
    return Response.json({ error: 'Enter the code from the text message.' }, { status: 400 });
  }
  if (tooMany(`verify:${phone}`, 6, 10 * 60_000) || tooMany(`verify-ip:${clientIp(req)}`, 20, 10 * 60_000)) {
    return Response.json({ error: 'Too many tries. Please wait a few minutes.' }, { status: 429 });
  }
  if (!(await checkCode(phone, code))) {
    return Response.json({ error: 'That code did not match. Check the text and try again.' }, { status: 401 });
  }
  await startSession(phone);
  return Response.json({ ok: true });
}
