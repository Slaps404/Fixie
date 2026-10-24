export type JobState =
  | 'NEW' | 'DIAGNOSED' | 'SOURCING' | 'AWAITING_CONFIRMATION' | 'ORDERED'
  | 'DECLINED' | 'DELIVERED' | 'INSTALLING' | 'FIXED' | 'ESCALATED'
  | 'STOPPED' | 'NOTIFIED';

export interface Quote {
  vendorId: string;
  supplier: string;
  price: number;
  shipping: number;
  landedTotal: number;
  inStock: boolean;
  eta: string | null;
  partNumberSaid?: string;
  identicalPart: boolean;
  rejectedReason?: string;
}

export interface Job {
  id: string;
  kind: 'consumer' | 'enterprise';
  state: JobState;
  createdAt: number;
  updatedAt: number;
  customer: { name: string; phone: string };
  appliance?: string;
  model?: string;
  symptom?: string;
  part?: { partNumber: string; name: string; techVisitCost: number; safetyNote?: string; rootCauseNote?: string };
  warranty?: { covered: boolean; detail: string };
  quotes: Quote[];
  bestDeal?: Quote;
  agentCostUsd: number;
  installStep?: number;
  fault?: { asset: string; code: string; site: string };
}

export interface FixieEvent {
  id: number;
  ts: string;
  jobId: string | null;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  simulated?: boolean;
}

export const money = (n: number) => `$${n.toFixed(2)}`;

export function savings(job: Job): number | null {
  const tech = job.part?.techVisitCost;
  if (!job.bestDeal || !tech) return null;
  return tech - job.bestDeal.landedTotal;
}

export const STATE_LABEL: Record<JobState, string> = {
  NEW: 'New',
  DIAGNOSED: 'Diagnosed',
  SOURCING: 'Finding the part',
  AWAITING_CONFIRMATION: 'Waiting for a yes',
  ORDERED: 'Ordered',
  DECLINED: 'Declined',
  DELIVERED: 'Delivered',
  INSTALLING: 'Installing',
  FIXED: 'Fixed',
  ESCALATED: 'Escalated to a pro',
  STOPPED: 'Stopped',
  NOTIFIED: 'Notified',
};
