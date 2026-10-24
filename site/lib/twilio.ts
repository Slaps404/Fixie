import 'server-only';

const sid = () => process.env.TWILIO_ACCOUNT_SID;
const token = () => process.env.TWILIO_AUTH_TOKEN;
const service = () => process.env.TWILIO_VERIFY_SERVICE_SID;

/** True when SMS codes cannot be sent for real. */
export const smsConfigured = () => Boolean(sid() && token() && service());

/** Explicit opt-in: codes are not sent, and TEST_CODE signs anyone in. Never enable on a public deploy. */
export const testMode = () => process.env.SIGNUP_TEST_MODE === '1';
export const TEST_CODE = '000000';

async function verify(path: string, body: Record<string, string>) {
  const res = await fetch(`https://verify.twilio.com/v2/Services/${service()}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${sid()}:${token()}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; code?: number };
  return { ok: res.ok, status: json.status, message: json.message, code: json.code };
}

export async function sendCode(phone: string): Promise<{ ok: boolean; error?: string }> {
  if (!smsConfigured()) return testMode() ? { ok: true } : { ok: false, error: 'Text messages are not set up yet.' };
  const r = await verify('Verifications', { To: phone, Channel: 'sms' });
  return r.ok ? { ok: true } : { ok: false, error: r.code === 60200 ? 'That does not look like a phone number.' : 'We could not text that number. Please try again.' };
}

export async function checkCode(phone: string, code: string): Promise<boolean> {
  if (!smsConfigured()) return testMode() && code === TEST_CODE;
  const r = await verify('VerificationCheck', { To: phone, Code: code });
  return r.ok && r.status === 'approved';
}
