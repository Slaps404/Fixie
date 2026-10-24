import { Geist_Mono } from 'next/font/google';
import { AdminConsole } from './AdminConsole';

const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-admin-mono' });

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <div className={mono.variable}>
      <AdminConsole />
    </div>
  );
}
