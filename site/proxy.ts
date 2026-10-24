import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isDashboard = createRouteMatcher(['/dashboard(.*)']);
const isApi = createRouteMatcher(['/api/fixie(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isDashboard(req)) {
    await auth.protect();
  } else if (isApi(req)) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}, { signInUrl: '/sign-in', signUpUrl: '/sign-up' });

export const config = {
  matcher: [
    // Skip Next internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
