import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { GetStarted } from '@/components/GetStarted';
import { getSession } from '@/lib/session';
import { smsConfigured, testMode } from '@/lib/twilio';
import { stripeConfigured } from '@/lib/stripe';

export const metadata = { title: 'Get started with Fixie' };

// Only same-site paths are allowed as a post-login destination.
const safeNext = (n?: string) => (n && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(n) ? n : '/dashboard');

export default async function Page({ searchParams }: { searchParams: Promise<{ signin?: string; next?: string; card?: string }> }) {
  const q = await searchParams;
  const session = await getSession();
  if (session && q.signin) redirect(safeNext(q.next));

  return (
    <AuthShell>
      <GetStarted
        signIn={Boolean(q.signin)}
        next={safeNext(q.next)}
        startAtCard={Boolean(session && q.card)}
        phone={session?.phone}
        testSms={!smsConfigured() && testMode()}
        testCard={!stripeConfigured() && testMode()}
      />
    </AuthShell>
  );
}
