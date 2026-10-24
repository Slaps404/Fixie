// Customer memory: one profile per caller phone, persisted to data/customers.json (tmp file + rename).
// The orchestrator is the only writer. Profiles are keyed by normalized phone digits; events must never carry them.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DATA_DIR } from './config.ts';
import type { JobState } from './types.ts';

export interface ApplianceRecord {
  appliance: string;
  model: string;
  purchaseYear?: number;
}

export interface JobEntry {
  jobId: string;
  issue: string;
  state: JobState;
  /** Epoch ms when the job was first remembered. */
  at: number;
}

/** Jargon difficulty ladder, easiest to hardest. Not knowing one implies not knowing every harder one. */
export const CONCEPTS = { breaker_box: 1, fuse: 2, multimeter: 3, continuity_test: 4 } as const;
export type Concept = keyof typeof CONCEPTS;
const CONCEPT_IDS = Object.keys(CONCEPTS) as Concept[];
export const isConcept = (c: unknown): c is Concept => typeof c === 'string' && c in CONCEPTS;
const CONCEPT_WORD = (c: Concept) => c.replace(/_/g, ' ');

export interface CustomerProfile {
  /** Normalized digits (last 10), never a display number. */
  phone: string;
  name?: string;
  hasMeter?: boolean;
  comfortWithTools?: 'none' | 'some' | 'handy';
  /** Sparse, explicit answers only. Everything else is inferred from the ladder by knowsConcept. */
  knows?: Partial<Record<Concept, boolean>>;
  appliances: ApplianceRecord[];
  jobs: JobEntry[];
  notes: string[];
}

/** CUSTOMERS_FILE env override exists so tests/tools can point the store elsewhere. */
const file = () => process.env.CUSTOMERS_FILE ?? join(DATA_DIR, 'customers.json');

let store: Map<string, CustomerProfile> | null = null;

/** Digits only, last 10, so "+1 (619) 555-0100" and "6195550100" are the same caller. */
export function normalizePhone(phone: string | undefined | null): string {
  return (phone ?? '').replace(/\D/g, '').slice(-10);
}

function load(): Map<string, CustomerProfile> {
  if (store) return store;
  store = new Map();
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as { customers?: CustomerProfile[] };
    for (const p of raw?.customers ?? []) {
      const key = normalizePhone(p?.phone);
      if (!key) continue;
      store.set(key, { ...p, phone: key, appliances: p.appliances ?? [], jobs: p.jobs ?? [], notes: p.notes ?? [] });
    }
  } catch {
    // Missing or corrupt file: start empty.
  }
  return store;
}

function save(): void {
  const path = file();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ customers: [...load().values()] }, null, 2));
    renameSync(tmp, path);
  } catch (err) {
    console.error('[memory] save failed:', (err as Error).message);
  }
}

export function getProfile(phone: string | undefined | null): CustomerProfile | undefined {
  const p = load().get(normalizePhone(phone));
  return p ? structuredClone(p) : undefined;
}

/** Creates the profile if missing, applies `mutate`, persists. Returns undefined when the phone has no digits. */
export function updateProfile(phone: string | undefined | null, mutate: (p: CustomerProfile) => void): CustomerProfile | undefined {
  const key = normalizePhone(phone);
  if (!key) return undefined;
  const map = load();
  const p = map.get(key) ?? { phone: key, appliances: [], jobs: [], notes: [] };
  mutate(p);
  p.phone = key;
  map.set(key, p);
  save();
  return structuredClone(p);
}

/** Upsert by model (case-insensitive); later facts fill in, never erase. */
export function rememberAppliance(p: CustomerProfile, a: ApplianceRecord): void {
  if (!a.model) return;
  const hit = p.appliances.find((x) => x.model.toUpperCase() === a.model.toUpperCase());
  if (!hit) {
    p.appliances.push({ ...a });
    return;
  }
  if (a.appliance) hit.appliance = a.appliance;
  if (a.purchaseYear) hit.purchaseYear = a.purchaseYear;
}

/** Upsert by jobId. */
export function rememberJob(p: CustomerProfile, j: Omit<JobEntry, 'at'> & { at?: number }): void {
  const hit = p.jobs.find((x) => x.jobId === j.jobId);
  if (hit) {
    if (j.issue) hit.issue = j.issue;
    hit.state = j.state;
    return;
  }
  p.jobs.push({ jobId: j.jobId, issue: j.issue, state: j.state, at: j.at ?? Date.now() });
}

export function rememberKnowledge(p: CustomerProfile, c: Concept, knows: boolean): void {
  p.knows = { ...p.knows, [c]: knows };
}

/** Explicit answer wins; else not knowing an easier-or-equal concept means no; else knowing a harder-or-equal one means yes. */
export function knowsConcept(p: CustomerProfile | undefined, c: Concept): boolean | undefined {
  const explicit = p?.knows?.[c];
  if (explicit !== undefined) return explicit;
  const level = CONCEPTS[c];
  const said = CONCEPT_IDS.filter((k) => p?.knows?.[k] !== undefined);
  if (said.some((k) => CONCEPTS[k] <= level && p?.knows?.[k] === false)) return false;
  if (said.some((k) => CONCEPTS[k] >= level && p?.knows?.[k] === true)) return true;
  return undefined;
}

/** Test/admin hook: forget everyone (and drop the cached store so the file is re-read). */
export function clearMemory(): void {
  store = new Map();
  save();
}

/** Re-read the file on next access (tests simulate a restart with this). */
export function reloadMemory(): void {
  store = null;
}

const STATE_WORD: Partial<Record<JobState, string>> = {
  ORDERED: 'ordered',
  DELIVERED: 'part delivered',
  INSTALLING: 'install in progress',
  FIXED: 'fixed',
  ESCALATED: 'escalated to a pro',
  DECLINED: 'declined the order',
  STOPPED: 'stopped',
};

const day = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });

function knowledge(p: CustomerProfile) {
  const no = CONCEPT_IDS.filter((c) => knowsConcept(p, c) === false);
  return {
    said: no.filter((c) => p.knows?.[c] === false).map(CONCEPT_WORD),
    inferred: no.filter((c) => p.knows?.[c] === undefined).map(CONCEPT_WORD),
    yes: CONCEPT_IDS.filter((c) => knowsConcept(p, c) === true).map(CONCEPT_WORD),
  };
}

/** Facts the intake agent may rely on, one short phrase each. No phone numbers. */
export function knownFacts(p: CustomerProfile | undefined): string[] {
  if (!p) return [];
  const out = profileFacts(p);
  const k = knowledge(p);
  if (k.said.length) out.push(`doesn't know ${k.said.join(', ')}${k.inferred.length ? ` (so not ${k.inferred.join(', ')} either)` : ''}`);
  if (k.yes.length) out.push(`knows ${k.yes.join(', ')}`);
  return out;
}

function profileFacts(p: CustomerProfile): string[] {
  const out: string[] = [];
  if (p.hasMeter === false) out.push("has NO multimeter (don't ask again)");
  if (p.hasMeter === true) out.push("has a multimeter (don't ask again)");
  if (p.comfortWithTools) out.push(`comfort with tools: ${p.comfortWithTools}`);
  return out;
}

function isReturning(p: CustomerProfile | undefined): p is CustomerProfile {
  return !!p && (!!p.name || p.hasMeter !== undefined || !!p.comfortWithTools || !!p.knows || p.appliances.length > 0 || p.jobs.length > 0 || p.notes.length > 0);
}

/** The lookup_caller tool result. */
export function summarize(p: CustomerProfile | undefined): string {
  if (!isReturning(p)) return 'New caller.';
  const last = p.appliances[p.appliances.length - 1];
  const parts: string[] = [];
  if (p.name) {
    const again = last
      ? ` Then ask if this is about their ${last.appliance ? `${last.appliance} ` : ''}${last.model} again; if yes, you already have the model${last.purchaseYear ? ' and purchase year' : ''}, so don't ask.`
      : '';
    parts.push(`Greet: "Welcome back, ${p.name}! It's Fixie again."${again}`);
  }
  parts.push(p.name ? `Returning caller: ${p.name}.` : 'Returning caller.');
  const known = profileFacts(p);
  if (known.length) parts.push(`Known: ${known.join('; ')}.`);
  const k = knowledge(p);
  if (k.said.length) {
    parts.push(
      `Doesn't know: ${k.said.join(', ')}${k.inferred.length ? `, so assume not ${k.inferred.join(', ')} either` : ''}. Use plain words and describe parts by what they look like.`,
    );
  }
  if (k.yes.length) parts.push(`Does know: ${k.yes.join(', ')}.`);
  if (p.appliances.length) {
    const list = p.appliances.map((a) => `${a.appliance ? `${a.appliance} ` : ''}${a.model}${a.purchaseYear ? ` (${a.purchaseYear})` : ''}`);
    parts.push(`Appliances: ${list.join('; ')}.`);
  }
  const lastJob = [...p.jobs].sort((a, b) => b.at - a.at)[0];
  if (lastJob) {
    const word = STATE_WORD[lastJob.state] ?? 'in progress, started';
    parts.push(`Last job: ${lastJob.issue}, ${word} ${day(lastJob.at)}.`);
  }
  if (p.notes.length) parts.push(`Notes: ${p.notes.slice(-2).join('; ')}.`);
  return parts.join(' ');
}
