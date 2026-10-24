'use client';

import { useRef, useState } from 'react';
import { formatPhone } from '@/lib/phone';

type Step = 'phone' | 'code' | 'card';

const field =
  'h-14 w-full rounded-panel border border-line-strong bg-surface px-4 text-2xl text-text placeholder:text-faint focus:border-accent focus:outline-none';
const primary =
  'inline-flex h-14 w-full items-center justify-center rounded-full bg-button px-7 text-xl font-medium text-button-text transition-colors hover:bg-white focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60';
const note = 'rounded-panel border border-line-strong bg-surface px-4 py-3 text-lg text-body';

async function post(url: string, body?: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const json = (await r.json().catch(() => ({}))) as { error?: string; [k: string]: unknown };
  return { ok: r.ok, json };
}

export function GetStarted(props: {
  signIn: boolean;
  next: string;
  startAtCard: boolean;
  phone?: string;
  testSms: boolean;
  testCard: boolean;
}) {
  const [step, setStep] = useState<Step>(props.startAtCard ? 'card' : 'phone');
  const [input, setInput] = useState('');
  const [phone, setPhone] = useState(props.phone ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  // One request at a time: the sixth digit auto-submits, and Enter would otherwise fire a second check.
  async function run(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const sendCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const { ok, json } = await post('/api/auth/start', { phone: input || phone });
      if (!ok) return setError(json.error ?? 'We could not send a code.');
      setPhone(String(json.phone));
      setCode('');
      setStep('code');
      setTimeout(() => codeRef.current?.focus(), 50);
    });
  };

  const verify = (value: string) =>
    run(async () => {
      const { ok, json } = await post('/api/auth/verify', { phone, code: value });
      if (!ok) return setError(json.error ?? 'That code did not match.');
      if (props.signIn) return void window.location.assign(props.next);
      setStep('card');
    });

  const checkout = () =>
    run(async () => {
      const { ok, json } = await post('/api/billing/checkout');
      if (!ok) return setError(json.error ?? 'We could not open the card page.');
      window.location.assign(String(json.url));
    });

  return (
    <div>
      <h1 className="text-balance text-[40px] font-light leading-[1.08] tracking-[-0.02em] sm:text-[48px]">
        {step === 'card' ? 'Add a card' : props.signIn ? 'Sign in' : 'Get started'}
      </h1>

      {step === 'phone' && (
        <form onSubmit={sendCode} className="mt-8 space-y-5">
          <p className="text-xl text-body">Enter your mobile number. We will text you a code.</p>
          {props.testSms && <p className={note}>Test mode: no text is sent. The code is 000000.</p>}
          <div>
            <label htmlFor="phone" className="mb-2 block text-lg text-text">Mobile number</label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(619) 555-0142"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className={field}
              required
            />
          </div>
          <button type="submit" disabled={busy} className={primary}>{busy ? 'Sending…' : 'Text me a code'}</button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={(e) => { e.preventDefault(); verify(code); }} className="mt-8 space-y-5">
          <p className="text-xl text-body">We texted a 6-digit code to {formatPhone(phone)}.</p>
          {props.testSms && <p className={note}>Test mode: the code is 000000.</p>}
          <div>
            <label htmlFor="code" className="mb-2 block text-lg text-text">Code</label>
            <input
              id="code"
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                if (v.length === 6 && !busy) verify(v);
              }}
              className={`${field} tracking-[0.3em]`}
              required
            />
          </div>
          <button type="submit" disabled={busy || code.length < 4} className={primary}>{busy ? 'Checking…' : 'Continue'}</button>
          <div className="flex gap-6 text-lg">
            <button type="button" onClick={() => sendCode()} disabled={busy} className="min-h-11 text-link underline underline-offset-4 hover:text-white">Send a new code</button>
            <button type="button" onClick={() => { setStep('phone'); setError(null); }} className="min-h-11 text-link underline underline-offset-4 hover:text-white">Change number</button>
          </div>
        </form>
      )}

      {step === 'card' && (
        <div className="mt-8 space-y-5">
          <p className="text-xl text-body">Fixie Family Plan is $9 a month. Cancel any time.</p>
          {props.testCard && <p className={note}>Test mode: card step simulated. No card is charged.</p>}
          <button type="button" onClick={checkout} disabled={busy} className={primary}>
            {busy ? 'Opening…' : props.testCard ? 'Continue' : 'Pay securely with Stripe'}
          </button>
          <p className="text-lg text-muted">Card details go straight to Stripe. Fixie never sees them, and never asks for them by phone.</p>
        </div>
      )}

      {error && <p role="alert" className="mt-5 rounded-panel border border-fault/50 bg-fault/10 px-4 py-3 text-lg text-fault">{error}</p>}
    </div>
  );
}
