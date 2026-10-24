import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.ts';
import { emit } from './events.ts';
import type { Jobs } from './contracts.ts';
import type { Job, JobState } from './types.ts';

/** JOBS_FILE env override exists so tests/tools can point the snapshot elsewhere. */
const JOBS_FILE = process.env.JOBS_FILE ?? join(DATA_DIR, 'jobs.json');
const CLOSED: JobState[] = ['FIXED', 'DECLINED', 'STOPPED', 'ESCALATED', 'NOTIFIED'];

const map = new Map<string, Job>();
let nextId = 1;

const idNum = (id: string) => Number(/^job_(\d+)$/.exec(id)?.[1] ?? 0);
const digits = (p: string | undefined) => (p ?? '').replace(/\D/g, '');
/** Compare on the last 10 digits so "+16195550100" and "6195550100" match. */
const phoneKey = (p: string | undefined) => digits(p).slice(-10);

function load(): void {
  try {
    const raw = JSON.parse(readFileSync(JOBS_FILE, 'utf8')) as { nextId?: number; jobs?: Job[] } | Job[];
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.jobs) ? raw.jobs : [];
    for (const j of list) {
      if (j && typeof j.id === 'string') map.set(j.id, j);
    }
    const maxId = Math.max(0, ...[...map.keys()].map(idNum));
    const stored = !Array.isArray(raw) && typeof raw?.nextId === 'number' ? raw.nextId : 1;
    nextId = Math.max(stored, maxId + 1);
  } catch {
    // Missing or corrupt snapshot: start empty.
  }
}

function snapshot(): void {
  try {
    const tmp = `${JOBS_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ nextId, jobs: [...map.values()] }, null, 2));
    renameSync(tmp, JOBS_FILE);
  } catch (err) {
    console.error('[jobs] snapshot failed:', (err as Error).message);
  }
}

load();

export const jobs: Jobs = {
  create(init) {
    const now = Date.now();
    const id = `job_${nextId++}`;
    const job: Job = {
      state: 'NEW',
      quotes: [],
      calls: [],
      vendorCallCount: {},
      laneAttempts: {},
      guardedCalls: 0,
      reservedMinutes: 0,
      agentCostUsd: 0,
      safetyAcks: [],
      callbackAttempts: 0,
      notes: [],
      ...init,
      id,
      createdAt: now,
      updatedAt: now,
    };
    map.set(id, job);
    snapshot();
    return job;
  },

  get(id) {
    return map.get(id);
  },

  byCaller(phone) {
    const key = phoneKey(phone);
    if (!key) return undefined;
    let best: Job | undefined;
    for (const j of map.values()) {
      if (CLOSED.includes(j.state) || phoneKey(j.customer?.phone) !== key) continue;
      if (!best || j.createdAt > best.createdAt || (j.createdAt === best.createdAt && idNum(j.id) > idNum(best.id))) {
        best = j;
      }
    }
    return best;
  },

  all() {
    return [...map.values()].sort((a, b) => a.createdAt - b.createdAt || idNum(a.id) - idNum(b.id));
  },

  transition(id, from, to) {
    const job = map.get(id);
    if (!job) return false;
    const allowed = Array.isArray(from) ? from : [from];
    if (!allowed.includes(job.state)) return false;
    const prev = job.state;
    job.state = to;
    job.updatedAt = Date.now();
    emit(id, 'job_state', { from: prev, to });
    snapshot();
    return true;
  },

  update(id, mutate) {
    const job = map.get(id);
    if (!job) return undefined;
    mutate(job);
    job.updatedAt = Date.now();
    snapshot();
    return job;
  },

  reset() {
    // Ids stay monotonic across resets so stale webhooks naming an old job can never hit a new one.
    map.clear();
    snapshot();
  },
};
