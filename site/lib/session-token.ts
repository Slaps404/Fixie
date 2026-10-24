import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'fixie_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type Session = { phone: string };
type Payload = Session & { exp: number };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET is missing or too short (use 32+ random characters)');
  return s;
}

const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

export function signSession(session: Session): string {
  const payload: Payload = { ...session, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as Payload;
    if (typeof p.phone !== 'string' || typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null;
    return { phone: p.phone };
  } catch {
    return null;
  }
}
