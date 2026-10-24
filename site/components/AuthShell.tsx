import { Logo } from './Logo';

/** Quiet, centered frame for the get-started and welcome pages. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="mx-auto flex h-16 max-w-[1200px] items-center px-5">
        <Logo />
      </header>
      <main className="mx-auto flex max-w-[480px] flex-col px-5 pb-20 pt-10 sm:pt-16">{children}</main>
    </div>
  );
}
