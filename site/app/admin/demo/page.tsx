import type { Metadata } from 'next';
import { requireAdmin } from '../_lib/auth';
import { DemoStage } from './DemoStage';

export const metadata: Metadata = { title: 'Fixie · stage', robots: { index: false, follow: false } };

export default async function DemoPage() {
  await requireAdmin();
  return <DemoStage />;
}
