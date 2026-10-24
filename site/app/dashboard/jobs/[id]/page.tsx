import Link from 'next/link';
import { JobDetail } from '@/components/JobDetail';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Link href="/dashboard" className="inline-flex min-h-12 items-center text-lg font-semibold text-brand underline underline-offset-4">&larr; All jobs</Link>
      <JobDetail id={id} />
    </>
  );
}
