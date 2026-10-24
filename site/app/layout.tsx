import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fixie: one number for anything that breaks',
  description:
    'Call one number. Fixie diagnoses the problem by voice, finds the part, and walks you through the fix. No app, no screen.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      <html lang="en">
        <body className="font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
