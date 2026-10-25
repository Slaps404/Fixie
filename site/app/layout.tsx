import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: 'Fixie: one number for anything that breaks',
  description:
    'Call one number. Fixie diagnoses the problem by voice, finds the part, and walks you through the fix. No app, no screen.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Before first paint, so scroll-reveal content starts hidden instead of flashing. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className={`${geist.className} antialiased`} style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        {children}
      </body>
    </html>
  );
}
