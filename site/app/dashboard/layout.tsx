import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { SignOutButton } from '@/components/SignOutButton';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-line bg-bg">
        <div className="mx-auto max-w-6xl px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo href="/dashboard" />
            <Link href="/dashboard" className="text-lg font-semibold text-link underline-offset-4 hover:underline min-h-12 inline-flex items-center">Jobs</Link>
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
