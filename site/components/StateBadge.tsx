import { STATE_LABEL, type JobState } from '@/lib/types';

const tone: Partial<Record<JobState, string>> = {
  FIXED: 'bg-green-100 text-green-900 border-green-700',
  STOPPED: 'bg-red-100 text-red-900 border-red-700',
  ESCALATED: 'bg-amber-100 text-amber-900 border-amber-700',
  DECLINED: 'bg-red-100 text-red-900 border-red-700',
};

export function StateBadge({ state }: { state: JobState }) {
  return (
    <span className={`inline-block rounded-full border-2 px-3 py-1 text-base font-bold ${tone[state] ?? 'bg-blue-50 text-blue-900 border-blue-700'}`}>
      {STATE_LABEL[state] ?? state}
    </span>
  );
}
