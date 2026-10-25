import { Geist, Geist_Mono } from 'next/font/google';
import { AGENT, WARM, FixieConsole, waveform } from '@/components/FixieConsole';
import { ScrollEffects } from '@/components/ScrollEffects';

const geist = Geist({ subsets: ['latin'], weight: ['300', '400', '500'] });
const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'] });

const PHONE_DISPLAY = '(619) 771-1086';
const PHONE_TEL = 'tel:+16197711086';

const r1 = (n: number) => Math.round(n * 10) / 10;

// Quarter arcs radiating from a dot: Fixie recognizing you.
const arcs = Array.from({ length: 16 }, (_, k) => {
  const i = k + 1;
  const r = 14 + i * 17;
  return { i, d: `M56 ${r1(214 - r)} A${r} ${r} 0 0 1 ${r1(56 + r)} 214` };
});

const callWave = waveform(304, 130, 46, 0.48);

// Progress rows, each a little fuller: diagnosed → found → delivered → fixed.
const rows = [
  { y: 62, label: 'Diagnosed', segs: [14, 14] },
  { y: 106, label: 'Part found', segs: [14, 14, 40] },
  { y: 150, label: 'Delivered', segs: [14, 14, 40, 60] },
  { y: 194, label: 'Fixed', segs: [14, 14, 40, 60, 40], warm: true },
].map((row) => {
  let x = 32;
  let d = '';
  for (const w of row.segs) {
    d += `M${x} ${row.y} H${x + w} `;
    x += w + 18;
  }
  return { ...row, d };
});

// Speech-shaped bar heights (0–1): a run of syllable bumps with jitter.
function speech(n: number, seed: number) {
  const syllables = [0.06, 0.17, 0.26, 0.38, 0.47, 0.6, 0.71, 0.83, 0.93];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const env = Math.max(
      ...syllables.map((c, k) => Math.exp(-(((t - c) / 0.045) ** 2)) * (0.5 + 0.5 * Math.abs(Math.sin(k * 2.3 + seed)))),
    );
    return 0.08 + 0.92 * env * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + seed)));
  });
}

// A voice coming down the line: rounded bars that keep talking (motion permitting).
function VoiceLine({ bars, seed, color, className }: { bars: number; seed: number; color: string; className: string }) {
  return (
    <div className={`items-center gap-[5px] overflow-hidden ${className}`} aria-hidden>
      {speech(bars, seed).map((h, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-full motion-safe:animate-[fixie-talk_1.8s_ease-in-out_infinite]"
          style={{ height: `${(h * 100).toFixed(1)}%`, background: color, animationDelay: `${(-i * 0.07).toFixed(2)}s` }}
        />
      ))}
    </div>
  );
}

const guards = [
  { value: '$40', label: 'Most it will spend on a part, shipping included' },
  { value: '$3', label: 'Cap on its own calling costs, per job' },
  { value: '0', label: 'Numbers dialed that aren’t approved suppliers or you' },
  { value: '1×', label: 'A supplier that doesn’t answer is skipped, never redialed' },
];

const card = 'rounded-[12px] bg-[#131314]';
const label = 'text-[13px] text-[#8E8E93]';
const stepNum = `${mono.className} text-[12px] text-[#8E8E93]`;
const stepTitle = 'text-[22px] font-normal tracking-[-0.01em]';
const stepBody = 'text-[15px] leading-[1.5] text-[#A1A1A6]';

function Mark() {
  return (
    <svg viewBox="0 0 22 22" className="h-[22px] w-[22px]" fill="none" aria-hidden>
      <circle cx="5" cy="17" r="2.2" fill="#EDEDED" />
      <path d="M5 10.5A6.5 6.5 0 0 1 11.5 17" stroke={AGENT} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5 4a13 13 0 0 1 13 13" stroke={WARM} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className={`${geist.className} min-h-screen bg-[#0B0B0C] text-[#EDEDED] leading-normal antialiased`}>
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-[#1A1A1D] bg-[#0B0B0C]/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2.5 text-[15px] font-medium">
              <Mark />
              Fixie
            </span>
            <span className="hidden text-[13px] text-[#8E8E93] sm:inline">One number for anything that breaks</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 text-[12px] text-[#A1A1A6] md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full motion-safe:animate-pulse" style={{ background: AGENT }} />
              Line open
            </span>
            <a href={PHONE_TEL} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#EDEDED] px-3.5 text-[12.5px] font-medium text-[#0B0B0C] hover:bg-white">
              <PhoneIcon className="h-3.5 w-3.5" />
              Call to get started
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="relative mx-auto max-w-[1200px] px-5 pb-14 pt-16 sm:pt-24">
            <h1 className="max-w-[860px] text-[42px] font-light leading-[1.04] tracking-[-0.03em] sm:text-[68px]">
              Something broke? Call one number.
              <span className="text-[#8E8E93]"> Fixie finds the part and talks you through the fix.</span>
            </h1>

            <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
              <a href={PHONE_TEL} className="group inline-flex items-center gap-5">
                <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#EDEDED] text-[#0B0B0C] transition-transform group-hover:scale-105">
                  <span className="absolute inset-0 rounded-full ring-1 ring-[#EDEDED] motion-safe:animate-[fixie-ring_2.4s_ease-out_infinite]" aria-hidden />
                  <PhoneIcon className="h-6 w-6" />
                </span>
                <span className="flex flex-col">
                  <span className={`${mono.className} text-[12px] text-[#8E8E93]`}>Call to get started</span>
                  <span className="text-[34px] font-light leading-none tracking-[-0.02em] sm:text-[44px]">{PHONE_DISPLAY}</span>
                </span>
              </a>
            </div>
          </div>
        </section>

        {/* Console */}
        <section className="mx-auto max-w-[1200px] px-3 sm:px-5" aria-label="What Fixie does behind the call">
          <FixieConsole />
          <p className="reveal mx-auto mt-4 max-w-[640px] text-center text-[13px] text-[#8E8E93]">
            Dorothy only hears the phone calls. Everything on the right happens without her.
          </p>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-[1200px] px-3 pt-28 sm:px-5" aria-labelledby="how">
          <div className="reveal px-2">
            <span className={label}>How it works</span>
            <h2 id="how" className="mt-3 max-w-[640px] text-[32px] font-light leading-[1.1] tracking-[-0.02em] sm:text-[40px]">
              Three steps, all of them on the phone.
            </h2>
          </div>
          <div className="reveal-group mt-8 grid grid-cols-1 gap-[10px] md:grid-cols-3">
            <div className={`${card} reveal flex flex-col overflow-hidden`}>
              <svg viewBox="0 0 360 260" className="block h-auto w-full" aria-hidden>
                {arcs.map((a) => (
                  <path
                    key={a.i}
                    d={a.d}
                    fill="none"
                    stroke={a.i % 3 === 0 ? WARM : AGENT}
                    strokeWidth="1"
                    strokeOpacity={a.i % 3 === 0 ? 0.6 : 0.85}
                    className="motion-safe:animate-[fixie-arc_3.2s_ease-in-out_infinite]"
                    style={{ animationDelay: `${a.i * 0.09}s` }}
                  />
                ))}
                <circle cx="56" cy="214" r="4" fill="#EDEDED" />
              </svg>
              <div className="mt-auto flex flex-col gap-2.5 px-7 pb-7">
                <span className={stepNum}>01</span>
                <span className={stepTitle}>Call to get started</span>
                <span className={stepBody}>
                  Your first call sets you up. Fixie learns your name, your address and what you own, so next time it knows you.
                </span>
              </div>
            </div>

            <div className={`${card} reveal flex flex-col overflow-hidden`}>
              <svg viewBox="0 0 360 260" className="block h-auto w-full" aria-hidden>
                <g transform="translate(28 0)">
                  <path d={callWave.quiet} stroke="#3A3A3E" strokeWidth="1.6" strokeLinecap="round" />
                  <path d={callWave.loud} stroke={AGENT} strokeWidth="1.6" strokeLinecap="round" />
                </g>
                <text x="28" y="206" fill="#8E8E93" fontSize="11" className={mono.className}>
                  &ldquo;my dryer won&rsquo;t heat&rdquo;
                </text>
                <text x="332" y="206" textAnchor="end" fill={AGENT} fontSize="11" className={mono.className}>
                  thermal fuse
                </text>
              </svg>
              <div className="mt-auto flex flex-col gap-2.5 px-7 pb-7">
                <span className={stepNum}>02</span>
                <span className={stepTitle}>Call and say what&rsquo;s wrong</span>
                <span className={stepBody}>
                  Talk like you would to a handy neighbor. Read the model sticker aloud and Fixie names the exact part.
                </span>
              </div>
            </div>

            <div className={`${card} reveal flex flex-col overflow-hidden`}>
              <svg viewBox="0 0 360 260" className="block h-auto w-full" aria-hidden>
                {rows.map((row) => (
                  <g key={row.label}>
                    <path d={row.d} stroke={row.warm ? WARM : '#EDEDED'} strokeWidth="9" strokeLinecap="round" />
                    <text x="332" y={row.y + 4} textAnchor="end" fontSize="12" fill={row.warm ? WARM : '#8E8E93'}>
                      {row.label}
                    </text>
                  </g>
                ))}
              </svg>
              <div className="mt-auto flex flex-col gap-2.5 px-7 pb-7">
                <span className={stepNum}>03</span>
                <span className={stepTitle}>It gets fixed</span>
                <span className={stepBody}>
                  Fixie finds the cheapest identical part, orders only when you say yes, and walks you through the install.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Guardrails */}
        <section className="mx-auto max-w-[1200px] px-3 pt-28 sm:px-5" aria-labelledby="guards">
          <div className="grid gap-8 px-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="reveal">
              <span className={label}>Guardrails</span>
              <h2 id="guards" className="mt-3 text-[32px] font-light leading-[1.1] tracking-[-0.02em] sm:text-[40px]">
                The limits live in code, not in a prompt.
              </h2>
              <p className="mt-4 max-w-[380px] text-[15px] leading-[1.5] text-[#A1A1A6]">
                Nothing is ordered without your spoken yes. No step that needs power until the dryer is unplugged.
              </p>
            </div>
            <div className="reveal-group grid grid-cols-2 gap-[10px]">
              {guards.map((g) => (
                <div key={g.label} className={`${card} reveal flex flex-col justify-between gap-6 p-6`}>
                  <span className="text-[44px] font-light leading-none tracking-[-0.03em]">{g.value}</span>
                  <span className="text-[13.5px] leading-[1.45] text-[#A1A1A6]">{g.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-[1200px] px-3 py-28 sm:px-5">
          <div className={`${card} reveal relative overflow-hidden`}>
            <VoiceLine
              bars={150}
              seed={3}
              color={AGENT}
              className="pointer-events-none absolute inset-x-0 top-1/2 flex h-48 -translate-y-1/2 justify-center opacity-40 [mask-image:linear-gradient(to_right,transparent_2%,black_18%,transparent_34%,transparent_66%,black_82%,transparent_98%)]"
            />
            <div className="relative flex flex-col items-center px-6 py-20 text-center">
              <span className={label}>Save this number</span>
              <h2 className="mt-4 max-w-[640px] text-[34px] font-light leading-[1.08] tracking-[-0.025em] sm:text-[48px]">
                Call to get started.
              </h2>
              <p className="mt-4 max-w-[460px] text-[15px] leading-[1.5] text-[#A1A1A6]">
                Your first call sets you up, so Fixie knows you every time after. Call from any phone, whenever something stops working.
              </p>
              <a href={PHONE_TEL} className="mt-8 inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-[#EDEDED] px-7 text-[20px] text-[#0B0B0C] transition-colors hover:bg-white">
                <PhoneIcon className="h-5 w-5" />
                {PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#1A1A1D]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-1 px-5 py-6 text-[12px] text-[#8E8E93] sm:flex-row sm:justify-between">
          <span>Every call opens with &ldquo;I&rsquo;m an AI assistant; this call is recorded.&rdquo;</span>
          <span>Fixie · Built at c0mpiled-16 UCSD</span>
        </div>
      </footer>
      <ScrollEffects />
    </div>
  );
}
