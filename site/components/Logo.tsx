import Link from 'next/link';

export function Mark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" className={className} fill="none" aria-hidden>
      <circle cx="5" cy="17" r="2.2" fill="var(--color-text)" />
      <path d="M5 10.5A6.5 6.5 0 0 1 11.5 17" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5 4a13 13 0 0 1 13 13" stroke="var(--color-warm)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2.5 text-xl font-medium text-text" aria-label="Fixie home">
      <Mark />
      Fixie
    </Link>
  );
}
