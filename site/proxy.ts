import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, readSession } from '@/lib/session-token';

export function proxy(req: NextRequest) {
  const signedIn = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (signedIn) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/get-started';
  url.search = `?signin=1&next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/dashboard/:path*', '/api/fixie/:path*'] };
