// Loose mirrors of server/src/types.ts. The Live tab renders whatever arrives, so nothing here is load-bearing.
export type FixieEvent = { id: number; ts: string; jobId: string | null; type: string; data: Record<string, any>; simulated?: boolean };
export type Quote = { vendorId: string; supplier: string; price: number; shipping: number; landedTotal: number; inStock: boolean; eta: string | null; partNumberSaid?: string; identicalPart: boolean; callId: string; rejectedReason?: string };
export type CallRecord = { callId: string; lane: string; vendorId?: string; to: string; startedAt: number; endedAt?: number; endedReason?: string; durationSec?: number };
export type Job = {
  id: string;
  kind: string;
  state: string;
  createdAt: number;
  updatedAt: number;
  customer: { name: string; phone: string };
  appliance?: string;
  model?: string;
  symptom?: string;
  part?: { partNumber: string; name: string; safety: string; safetyNote?: string; techVisitCost?: number };
  warranty?: { covered: boolean; detail: string };
  quotes: Quote[];
  bestDeal?: Quote;
  calls: CallRecord[];
  vendorCallCount: Record<string, number>;
  laneAttempts: Record<string, number>;
  guardedCalls: number;
  reservedMinutes: number;
  agentCostUsd: number;
  safetyAcks: string[];
  callbackAttempts: number;
  installStep?: number;
  diagnosis?: { posterior: Record<string, number>; observations: Record<string, string> };
  fault?: { asset: string; code: string; site: string };
  notes: string[];
};
export type Snapshot = { at: string; apiUrl: string; health: any; jobs: Job[] | { error: string }; log: string[] };
export type LiveCall = { callId: string; jobId: string | null; lane: string; party: string; phone: string; mode?: string; startedAt: number; endedAt?: number; durationSec?: number; reason?: string; transcript: { speaker: string; text: string; ts: string }[] };

// Contract with GET /admin/api/state (see admin-contract.md). Phones are masked unless reveal=1.
export type TLine = { ts: string; speaker: string; text: string };

export type CustomerView = {
  key: string;
  name: string | null;
  phone: string;
  appliances: { appliance: string; model: string; purchaseYear?: number }[];
  jobs: { jobId: string; issue: string; state: string; at: number }[];
  notes: string[];
  lastSeen: number | null;
};

export type QuoteView = {
  price: number;
  shipping: number;
  landedTotal: number;
  inStock: boolean;
  eta: string | null;
  identicalPart: boolean;
  rejectedReason: string | null;
  url: string | null;
  partNumberSaid: string | null;
};

export type ResponseOutcome = 'quoted' | 'rejected' | 'no_quote' | 'in_progress';

export type ResponseView = {
  id: string;
  jobId: string;
  partNumber: string | null;
  vendorId: string | null;
  supplier: string;
  lane: 'supplier' | 'warranty';
  channel: 'phone' | 'online';
  at: number;
  outcome: ResponseOutcome;
  endedReason: string | null;
  durationSec: number | null;
  quote: QuoteView | null;
  chosen: boolean;
  transcript: TLine[];
};

export type PaymentKind = 'mock' | 'card';
export type PaymentStatus = 'confirmed' | 'placed' | 'declined' | 'failed';

export type OrderView = {
  jobId: string;
  customer: { key: string; name: string | null; phone: string };
  jobState: string;
  part: { partNumber: string; name: string } | null;
  supplier: string;
  url: string | null;
  price: number;
  shipping: number;
  landedTotal: number;
  eta: string | null;
  placedAt: number;
  approvedBy: string | null;
  payment: { kind: PaymentKind; status: PaymentStatus; orderId: string | null; last4: string | null; reason: string | null };
};

export type MessageChannel = 'whatsapp' | 'sms';
export type PartyKind = 'customer' | 'vendor' | 'warranty' | 'tech' | 'unknown';

export type MessageView = {
  id: string;
  at: number;
  direction: 'out' | 'in';
  channel: MessageChannel;
  phone: string;
  party: { key: string | null; name: string | null; kind: PartyKind };
  body: string;
  status: 'sent' | 'failed' | 'dry_run' | 'received';
  reason: string | null;
  source: 'admin' | 'agent' | 'inbound';
  jobId: string | null;
};

export type DirectoryKind = 'fixie' | 'customer' | 'vendor' | 'warranty' | 'tech' | 'test_user';

export type DirectoryEntry = {
  key: string;
  kind: DirectoryKind;
  name: string;
  phone: string;
  lane: string | null;
  mode: 'live' | 'sim' | null;
  textable: boolean;
  jobIds: string[];
};

export type Channels = { whatsapp: boolean; sms: boolean; dryRun: boolean };

export type AdminState = {
  now: number;
  customers: CustomerView[];
  orders: OrderView[];
  responses: ResponseView[];
  messages: MessageView[];
  directory: DirectoryEntry[];
  channels: Channels;
};

export type TabId = 'live' | 'customers' | 'vendors' | 'orders' | 'messages' | 'numbers';
// Asks the Messages tab to open a conversation; the nonce lets the same recipient be requested twice.
export type TextTarget = { key: string; nonce: number };
