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

const FX_BOOT =
  "var d=document.documentElement;d.classList.add('js');setTimeout(function(){if(!d.hasAttribute('data-fx'))d.classList.remove('js')},2500)";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Before first paint, so scroll-reveal content starts hidden instead of flashing. If ScrollEffects
            hasn't taken over within 2.5 s (script blocked, hydration error), drop the class so nothing stays hidden. */}
        <script dangerouslySetInnerHTML={{ __html: FX_BOOT }} />
      </head>
      <body className={`${geist.className} antialiased`} style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        {children}
      </body>
    </html>
  );
}
