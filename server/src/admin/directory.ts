// The one place that decides who a phone number belongs to. Customers, messages, orders and the send route all resolve through it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, config, modeFor } from '../config.ts';
import { safeRoster } from '../dialer.ts';
import { jobs } from '../jobs.ts';
import { normalizePhone as phoneKey, type CustomerProfile } from '../memory.ts';
import type { Job, RosterEntry } from '../types.ts';

export { phoneKey };

export type DirectoryKind = 'fixie' | 'customer' | 'vendor' | 'warranty' | 'tech' | 'test_user';

/** Same shape as the contract's DirectoryEntry, with the full phone. Views mask it. */
export interface DirEntry {
  key: string;
  kind: DirectoryKind;
  name: string;
  phone: string;
  lane: string | null;
  mode: 'live' | 'sim' | null;
  textable: boolean;
  /** Newest first. */
  jobIds: string[];
}

export interface Customer {
  key: string;
  name: string | null;
  phone: string;
  appliances: { appliance: string; model: string; purchaseYear?: number }[];
  jobs: { jobId: string; issue: string; state: string; at: number }[];
  notes: string[];
  lastSeen: number | null;
}

export interface Directory {
  entries: DirEntry[];
  byKey: Map<string, DirEntry>;
  /** Customers win over roster entries when a number appears in both (a roster test user is usually also a caller). */
  byPhone(phone: string | undefined | null): DirEntry | undefined;
  customers: Customer[];
}

export const fixiePhone = () => process.env.FIXIE_PUBLIC_NUMBER || '+16197711086';

/** US numbers are stored as 10 digits in customer memory, but Twilio needs E.164. */
export function e164(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `+1${d}` : `+${d}`;
}

const customersFile = () => process.env.CUSTOMERS_FILE ?? join(DATA_DIR, 'customers.json');

function readProfiles(): CustomerProfile[] {
  try {
    const raw = JSON.parse(readFileSync(customersFile(), 'utf8')) as { customers?: CustomerProfile[] };
    return Array.isArray(raw?.customers) ? raw.customers : [];
  } catch {
    return [];
  }
}

/** Profiles from customers.json merged with every job's caller, joined on the last 10 digits. */
function collectCustomers(allJobs: Job[]): Customer[] {
  const byKey = new Map<string, { profile?: CustomerProfile; jobs: Job[] }>();
  const slot = (k: string) => byKey.get(k) ?? byKey.set(k, { jobs: [] }).get(k)!;
  for (const p of readProfiles()) {
    const k = phoneKey(p?.phone);
    if (k) slot(k).profile = p;
  }
  for (const j of allJobs) {
    const k = phoneKey(j.customer?.phone);
    if (k) slot(k).jobs.push(j);
  }
  const out: Customer[] = [];
  for (const [k, { profile, jobs: js }] of byKey) {
    const latest = [...js].sort((a, b) => b.createdAt - a.createdAt)[0];
    const merged = new Map<string, Customer['jobs'][number]>();
    for (const e of profile?.jobs ?? []) merged.set(e.jobId, { jobId: e.jobId, issue: e.issue, state: e.state, at: e.at });
    for (const j of js) merged.set(j.id, { jobId: j.id, issue: j.symptom ?? j.appliance ?? '', state: j.state, at: j.createdAt });
    const appliances = [...(profile?.appliances ?? [])];
    for (const j of js) {
      if (j.appliance && !appliances.some((a) => a.appliance === j.appliance && a.model === (j.model ?? ''))) {
        appliances.push({ appliance: j.appliance, model: j.model ?? '', ...(j.purchaseYear ? { purchaseYear: j.purchaseYear } : {}) });
      }
    }
    const history = [...merged.values()].sort((a, b) => b.at - a.at);
    out.push({
      key: `cust:${k}`,
      name: profile?.name || latest?.customer.name || null,
      phone: e164(latest?.customer.phone || k),
      appliances,
      jobs: history,
      notes: (profile?.notes ?? []).slice(-10),
      lastSeen: history[0]?.at ?? null,
    });
  }
  return out.sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
}

function rosterEntries(allJobs: Job[]): DirEntry[] {
  const r = safeRoster();
  if (!r) return [];
  const jobIdsFor = (e: RosterEntry) => {
    const k = phoneKey(e.phone);
    return allJobs
      .filter((j) => phoneKey(j.customer?.phone) === k || j.calls.some((c) => phoneKey(c.to) === k))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((j) => j.id);
  };
  const row = (e: RosterEntry, kind: DirectoryKind): DirEntry => ({
    key: `roster:${e.id}`,
    kind,
    name: e.name,
    phone: e164(e.phone),
    lane: e.lane,
    mode: config.dryRun ? 'sim' : (e.mode ?? modeFor(e.lane)),
    textable: true,
    jobIds: jobIdsFor(e),
  });
  return [row(r.user, 'test_user'), row(r.warranty, 'warranty'), ...r.suppliers.map((s) => row(s, 'vendor')), ...(r.tech ? [row(r.tech, 'tech')] : [])];
}

export function buildDirectory(): Directory {
  const allJobs = jobs.all();
  const customers = collectCustomers(allJobs);
  const entries: DirEntry[] = [
    { key: 'fixie', kind: 'fixie', name: 'Fixie', phone: fixiePhone(), lane: null, mode: null, textable: false, jobIds: [] },
    ...customers.map((c): DirEntry => ({
      key: c.key,
      kind: 'customer',
      name: c.name ?? c.phone,
      phone: c.phone,
      lane: null,
      mode: null,
      textable: phoneKey(c.phone).length === 10,
      jobIds: c.jobs.map((j) => j.jobId),
    })),
    ...rosterEntries(allJobs),
  ];
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const byPhoneKey = new Map<string, DirEntry>();
  for (const e of entries) {
    const k = phoneKey(e.phone);
    if (k && !byPhoneKey.has(k)) byPhoneKey.set(k, e);
  }
  return { entries, byKey, customers, byPhone: (p) => byPhoneKey.get(phoneKey(p)) };
}
