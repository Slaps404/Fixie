import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const ADMIN_COOKIE = 'fixie_admin';
const MAX_AGE = 60 * 60 * 12;

const USER = process.env.ADMIN_USER || 'bao';
const PASS = process.env.ADMIN_PASS || 'bao';

// The cookie is an HMAC over the credentials, so changing ADMIN_PASS logs everyone out.
function token(): string {
  return createHmac('sha256', process.env.SESSION_SECRET || 'fixie-admin').update(`${USER}:${PASS}`).digest('base64url');
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkCredentials(user: string, pass: string): boolean {
  return same(user, USER) && same(pass, PASS);
}

export async function isAdmin(): Promise<boolean> {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!value && same(value, token());
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login');
}

export async function startAdminSession(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, token(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: MAX_AGE,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: '/admin' });
}
