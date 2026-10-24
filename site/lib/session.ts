import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_MAX_AGE, readSession, signSession, type Session } from './session-token';

export type { Session };

/** The signed-in caller, or null. Safe to call from any server component or route handler. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}

export async function startSession(phone: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession({ phone }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
