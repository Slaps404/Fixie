import { STATE_LABEL, type JobState } from '@/lib/types';

const warm = 'bg-warm/10 border-warm/40 text-warm';
const fault = 'bg-fault/10 border-fault/40 text-fault';

const tone: Partial<Record<JobState, string>> = {
  FIXED: warm,
  STOPPED: fault,
  ESCALATED: warm,
  DECLINED: fault,
};

export function StateBadge({ state }: { state: JobState }) {
  return (
    <span className={`inline-block rounded-full border px-3 py-1 text-base font-semibold ${tone[state] ?? 'bg-accent/10 border-accent/40 text-accent'}`}>
      {STATE_LABEL[state] ?? state}
    </span>
  );
}
