import Link from 'next/link';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-3 min-h-12" aria-label="Fixie home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" width={44} height={44} alt="" />
      <span className="text-3xl font-extrabold tracking-tight text-brand-dark">Fixie</span>
    </Link>
  );
}
