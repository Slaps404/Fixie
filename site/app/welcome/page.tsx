import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { getSession } from '@/lib/session';
import { checkoutPaidFor, stripeConfigured } from '@/lib/stripe';
import { testMode } from '@/lib/twilio';

export const metadata = { title: "You're in" };

const pill = 'inline-flex h-14 w-full items-center justify-center rounded-full px-7 text-xl font-medium transition-colors';

export default async function Page({ searchParams }: { searchParams: Promise<{ session_id?: string; test?: string }> }) {
  const q = await searchParams;
  const session = await getSession();
  if (!session) redirect('/get-started');

  const simulated = q.test === '1' && !stripeConfigured() && testMode();
  const paid = simulated || (q.session_id ? await checkoutPaidFor(q.session_id, session.phone).catch(() => false) : false);
  if (!paid) redirect('/get-started?card=1');

  return (
    <AuthShell>
      <h1 className="text-balance text-[40px] font-light leading-[1.08] tracking-[-0.02em] sm:text-[48px]">You&rsquo;re in!</h1>
      <p className="mt-6 text-xl text-body">Save this number. Call it any time something breaks.</p>
      {simulated && <p className="mt-5 rounded-panel border border-line-strong bg-surface px-4 py-3 text-lg text-body">Test mode: card step simulated.</p>}

      <a href="tel:+16197711086" className="mt-8 block rounded-card bg-surface p-6 hover:bg-line">
        <span className="block text-lg text-muted">Fixie</span>
        <span className="block text-[40px] font-light leading-tight tracking-[-0.02em] sm:text-[44px]">(619) 771-1086</span>
      </a>

      <div className="mt-6 space-y-3">
        <a href="/contact.vcf" download="Fixie.vcf" className={`${pill} bg-button text-button-text hover:bg-white`}>Add Fixie to contacts</a>
        <a href="tel:+16197711086" className={`${pill} border border-line-strong text-text hover:border-faint`}>Call Fixie now</a>
      </div>
    </AuthShell>
  );
}
