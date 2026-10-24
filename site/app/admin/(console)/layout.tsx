import type { Metadata } from 'next';
import { requireAdmin } from '../_lib/auth';

export const metadata: Metadata = { title: 'Fixie admin', robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
