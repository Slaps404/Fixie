import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Logo } from '@/components/Logo';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b-2 border-slate-200">
        <div className="mx-auto max-w-6xl px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo href="/dashboard" />
            <Link href="/dashboard" className="text-lg font-semibold text-brand underline-offset-4 hover:underline min-h-12 inline-flex items-center">Jobs</Link>
          </div>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
