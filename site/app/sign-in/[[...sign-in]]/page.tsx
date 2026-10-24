import { SignIn } from '@clerk/nextjs';
import { Logo } from '@/components/Logo';

export default function Page() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-soft">
      <Logo />
      <SignIn forceRedirectUrl="/dashboard" />
    </main>
  );
}
