import Link from 'next/link';
import { Show } from '@clerk/nextjs';
import { Logo } from '@/components/Logo';

const PHONE_DISPLAY = '+1 (619) 771-1086';
const PHONE_TEL = 'tel:+16197711086';

const steps = [
  { n: 1, title: 'You call', body: 'Dial one number from any phone. No app and no screen. Fixie says up front that it is an AI and that the call is recorded.' },
  { n: 2, title: 'We diagnose', body: 'Fixie asks a few questions and has you read the model sticker aloud. It names the exact part, flags the real cause (like a clogged vent), and checks that the repair is safe to do yourself.' },
  { n: 3, title: 'We find the part, you say yes', body: 'Fixie phones the warranty line and parts suppliers at the same time, compares the identical part, and calls you back with the cheapest total. Nothing is ordered until you say "order it".' },
  { n: 4, title: 'We call when it arrives', body: 'When the part is delivered, Fixie calls and walks you through the install, step by step, then checks that it worked.' },
];

const different = [
  { title: 'It finishes the job', body: 'Other assistants tell you how to fix it. Fixie diagnoses, sources the part, gets your spoken yes, and coaches the install by voice. That is one closed loop, across days.' },
  { title: 'Guardrails live in code', body: 'Spend caps, a safety gate and an audit log are enforced by the server, not left to a prompt. Every time one trips, it is logged with a plain reason.' },
  { title: 'A stop button that works', body: 'A caregiver or operator can stop any job from the dashboard. That ends every live call.' },
];

const guards = [
  'Parts must total $40 or less, shipping included.',
  'A supplier who does not answer is skipped, never redialed.',
  'No "restore power" step until the dryer is confirmed unplugged and the vent is cleared.',
  "Fixie's own call cost is capped at $3 per job.",
  'Only approved supplier numbers, or your own number, are ever dialed.',
];

const honest = [
  'In our demo, suppliers are role-played by friends, with prices taken from real listings.',
  'The parts catalog is seeded. We do not claim a learned parts graph.',
  'Fixie compares quotes for the identical part. It does not negotiate.',
  'The port fault example is a simulation and is labeled as one.',
  'No payments or card details are ever taken by voice.',
];

function CallButton({ className = '' }: { className?: string }) {
  return (
    <a
      href={PHONE_TEL}
      className={`inline-flex flex-col items-center justify-center rounded-3xl bg-brand px-10 py-8 text-white shadow-xl hover:bg-brand-dark transition-colors min-h-28 ${className}`}
    >
      <span className="text-lg font-semibold uppercase tracking-wide">Tap to call Fixie</span>
      <span className="text-4xl sm:text-6xl font-extrabold tracking-tight">{PHONE_DISPLAY}</span>
    </a>
  );
}

export default function Home() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-white focus:p-3 focus:rounded">
        Skip to content
      </a>
      <header className="border-b-2 border-slate-200">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between gap-4">
          <Logo />
          <nav className="flex items-center gap-3">
            <Show when="signed-in">
              <Link href="/dashboard" className="rounded-xl bg-brand px-6 py-3 text-lg font-bold text-white min-h-12 inline-flex items-center hover:bg-brand-dark">
                Dashboard
              </Link>
            </Show>
            <Show when="signed-out">
              <Link href="/sign-in" className="rounded-xl border-2 border-brand px-6 py-3 text-lg font-bold text-brand min-h-12 inline-flex items-center hover:bg-soft">
                Sign in
              </Link>
            </Show>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="bg-soft">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20 text-center">
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-brand-dark">One number for anything that breaks</h1>
            <p className="mx-auto mt-6 max-w-3xl text-xl sm:text-2xl">
              Call from any phone. Fixie works out what is wrong, finds the cheapest identical part, and talks you through the fix. No app, no screen, no smartphone.
            </p>
            <div className="mt-10"><CallButton /></div>
            <p className="mt-5 text-lg">Every call starts with &ldquo;I&rsquo;m an AI assistant; this call is recorded.&rdquo;</p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16" aria-labelledby="how">
          <h2 id="how" className="text-3xl sm:text-4xl font-extrabold text-brand-dark">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-2">
            {steps.map((s) => (
              <li key={s.n} className="rounded-2xl border-2 border-slate-300 p-6">
                <div className="flex items-center gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand text-2xl font-extrabold text-white" aria-hidden>{s.n}</span>
                  <h3 className="text-2xl font-bold">{s.title}</h3>
                </div>
                <p className="mt-4 text-xl">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xl">
            Example: Dorothy&rsquo;s dryer runs but will not heat. Fixie names the thermal fuse, finds it for $13.05 landed against a $200 tech visit, and walks her through the 15-minute install.
          </p>
        </section>

        <section className="bg-slate-50 border-y-2 border-slate-200" aria-labelledby="why">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <h2 id="why" className="text-3xl sm:text-4xl font-extrabold text-brand-dark">Why it&rsquo;s different</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {different.map((d) => (
                <div key={d.title} className="rounded-2xl bg-white border-2 border-slate-300 p-6">
                  <h3 className="text-2xl font-bold">{d.title}</h3>
                  <p className="mt-3 text-xl">{d.body}</p>
                </div>
              ))}
            </div>
            <h3 className="mt-10 text-2xl font-bold">Guardrails that trip for real</h3>
            <ul className="mt-4 space-y-3 text-xl list-disc pl-7">
              {guards.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16" aria-labelledby="biz">
          <h2 id="biz" className="text-3xl sm:text-4xl font-extrabold text-brand-dark">For businesses</h2>
          <p className="mt-5 max-w-3xl text-xl">
            The same engine works for ports and fleets. A terminal tractor throws a fault code, and Fixie starts sourcing the part before the ship docks. Our port demo is a labeled simulation. Interested? Sign in as an operator to see the live audit view.
          </p>
        </section>

        <section className="bg-slate-50 border-y-2 border-slate-200" aria-labelledby="honest">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <h2 id="honest" className="text-3xl sm:text-4xl font-extrabold text-brand-dark">Honest notes</h2>
            <ul className="mt-6 space-y-3 text-xl list-disc pl-7 max-w-3xl">
              {honest.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16 text-center" aria-labelledby="family">
          <h2 id="family" className="text-3xl sm:text-4xl font-extrabold text-brand-dark">Family caregivers and operators</h2>
          <p className="mx-auto mt-5 max-w-3xl text-xl">
            Sign in to see every job, the quotes Fixie collected, the guardrails that tripped, and a live timeline of each call. You can stop a job at any time.
          </p>
          <div className="mt-8">
            <Show when="signed-out">
              <Link href="/sign-in" className="inline-flex items-center justify-center rounded-2xl bg-brand px-10 py-5 text-2xl font-bold text-white min-h-16 hover:bg-brand-dark">
                Sign in
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard" className="inline-flex items-center justify-center rounded-2xl bg-brand px-10 py-5 text-2xl font-bold text-white min-h-16 hover:bg-brand-dark">
                Open the dashboard
              </Link>
            </Show>
          </div>
          <p className="mt-4 text-lg">Sign in with your phone number (we text a code) or with Google.</p>
        </section>
      </main>

      <footer className="bg-brand-dark text-white">
        <div className="mx-auto max-w-5xl px-5 py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-lg">
          <p>Fixie. Built at c0mpiled-16 UCSD.</p>
          <a href={PHONE_TEL} className="text-2xl font-bold underline underline-offset-4">{PHONE_DISPLAY}</a>
        </div>
      </footer>
    </>
  );
}
