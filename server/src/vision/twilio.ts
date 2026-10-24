// Minimal Twilio Messaging helpers, dependency-free: best-effort SMS send, MMS media download, webhook signature check.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.ts';

const sid = () => process.env.TWILIO_ACCOUNT_SID ?? '';
const token = () => process.env.TWILIO_AUTH_TOKEN ?? '';
const fromNumber = () => process.env.TWILIO_PHONE_NUMBER ?? process.env.TWILIO_FROM_NUMBER ?? '';
const basicAuth = () => 'Basic ' + Buffer.from(`${sid()}:${token()}`).toString('base64');

/**
 * Best effort. An unregistered US 10DLC number is usually filtered by carriers (error 30034), and Twilio reports that
 * asynchronously, so `sent: true` only means Twilio accepted it. The spoken code is the real fallback.
 */
export async function sendSms(to: string, body: string): Promise<{ sent: boolean; reason: string }> {
  if (config.dryRun) return { sent: false, reason: 'DRY_RUN: SMS not sent' };
  if (!sid() || !token() || !fromNumber()) return { sent: false, reason: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER not set' };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid())}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: fromNumber(), Body: body }).toString(),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { sent: false, reason: `Twilio ${res.status}: ${(await res.text()).slice(0, 160)}` };
    return { sent: true, reason: 'accepted by Twilio (delivery not confirmed)' };
  } catch (err) {
    return { sent: false, reason: `Twilio request failed: ${(err as Error).message}` };
  }
}

/** Only Twilio's own media host gets our credentials. Anything else is refused (prevents credential leaks via spoofed webhooks). */
export function isTwilioMediaUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && url.hostname === 'api.twilio.com' && url.pathname.startsWith('/2010-04-01/Accounts/');
  } catch {
    return false;
  }
}

export const MAX_MMS_BYTES = 8 * 1024 * 1024;

export async function downloadMedia(u: string): Promise<{ mime: string; data: Buffer }> {
  if (!isTwilioMediaUrl(u)) throw new Error('refusing non-Twilio media URL');
  // Twilio answers with a redirect to a signed CDN URL; fetch drops Authorization on the cross-origin hop.
  const res = await fetch(u, { headers: sid() && token() ? { Authorization: basicAuth() } : {}, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`media ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_MMS_BYTES) throw new Error('media too large');
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_MMS_BYTES) throw new Error('media too large');
  return { mime: res.headers.get('content-type') ?? 'application/octet-stream', data };
}

/** X-Twilio-Signature: base64(HMAC-SHA1(authToken, fullUrl + concat(sorted(key + value)))). */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

export function validTwilioSignature(header: string | undefined, url: string, params: Record<string, string>, authToken = token()): boolean {
  if (!header || !authToken) return false;
  const want = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

export const twilioConfigured = () => Boolean(sid() && token());
