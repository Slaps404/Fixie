// End-to-end sim rehearsal against a running server (start it with `SIM_SPEED=4 npm start`).
// Drives intake → sourcing → callback → ORDERED → delivered → FIXED over HTTP only, then asserts the key events.
import 'dotenv/config';

const BASE = (process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '');
const ADMIN = process.env.ADMIN_TOKEN ?? 'fixie-demo';
const TIMEOUT_MS = Number(process.env.DEMO_TIMEOUT_MS ?? 90_000);

interface Ev {
  id: number;
  ts: string;
  jobId: string | null;
  type: string;
  data: Record<string, unknown>;
  simulated?: boolean;
}
interface JobLite {
  id: string;
  state: string;
  createdAt?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T = unknown>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin': ADMIN },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return text as unknown as T;
  }
}

async function latestJob(): Promise<JobLite | undefined> {
  const raw = await api<unknown>('GET', '/jobs');
  const list = (Array.isArray(raw) ? raw : ((raw as { jobs?: unknown[] })?.jobs ?? [])) as JobLite[];
  return [...list].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

const DEAD = new Set(['STOPPED', 'ESCALATED', 'DECLINED']);

async function waitFor(state: string, t0: number): Promise<JobLite> {
  let last = '';
  while (Date.now() - t0 < TIMEOUT_MS) {
    const job = await latestJob().catch(() => undefined);
    if (job && job.state !== last) {
      last = job.state;
      console.log(`  ${secs(t0)}  job ${job.id}: ${job.state}`);
    }
    if (job?.state === state) return job;
    if (job && DEAD.has(job.state)) throw new Error(`job ${job.id} reached ${job.state} while waiting for ${state}`);
    await sleep(500);
  }
  throw new Error(`timed out after ${TIMEOUT_MS / 1000}s waiting for ${state} (last: ${last || 'no job'})`);
}

const secs = (t0: number, t = Date.now()) => `+${((t - t0) / 1000).toFixed(1).padStart(5)}s`;

function summarize(e: Ev): string {
  const d = e.data ?? {};
  const pick = (...keys: string[]) =>
    keys
      .filter((k) => d[k] !== undefined && d[k] !== null && d[k] !== '')
      .map((k) => `${k}=${typeof d[k] === 'object' ? JSON.stringify(d[k]) : String(d[k])}`)
      .join(' ');
  switch (e.type) {
    case 'transcript':
      return `[${d.lane ?? ''}] ${d.speaker ?? d.role ?? ''}: ${String(d.text ?? '').slice(0, 90)}`;
    case 'guard':
      return pick('kind', 'action', 'reason', 'detail');
    case 'quote':
      return pick('supplier', 'vendorId', 'landedTotal', 'inStock', 'identicalPart', 'rejectedReason', 'reason');
    default: {
      const s = JSON.stringify(d);
      return s.length > 140 ? s.slice(0, 137) + '...' : s;
    }
  }
}

async function main(): Promise<void> {
  console.log(`demo:sim against ${BASE}`);
  const health = await api<Record<string, unknown>>('GET', '/health');
  console.log(`  health: ${JSON.stringify(health)}`);

  await api('POST', '/demo/reset');
  const t0 = Date.now();
  console.log('  reset ok; starting sim intake');
  await api('POST', '/demo/sim-intake', {});

  await waitFor('ORDERED', t0);
  console.log(`  ${secs(t0)}  firing /simulate/delivered`);
  await api('POST', '/simulate/delivered', { carrier: 'UPS', status: 'delivered' });
  await waitFor('FIXED', t0);
  await sleep(1500); // let trailing transcripts / end-of-call reports land

  const events = await api<Ev[]>('GET', '/events.json?since=0');
  const start = events.length ? Date.parse(events[0].ts) : t0;
  console.log(`\nEvent timeline (${events.length} events):`);
  for (const e of events) {
    console.log(`  ${secs(start, Date.parse(e.ts))}  ${e.simulated ? 'SIM ' : '    '}${e.type.padEnd(16)} ${summarize(e)}`);
  }

  const has = (type: string, pred: (e: Ev) => boolean = () => true) => events.some((e) => e.type === type && pred(e));
  const diagUpdates = events.filter((e) => e.type === 'diagnosis_update');
  const lastDiag = diagUpdates[diagUpdates.length - 1];
  const finalProb = Number((lastDiag?.data?.posterior as Record<string, number> | undefined)?.thermal_fuse ?? lastDiag?.data?.topProb ?? 0);
  const checks: Array<[string, boolean]> = [
    ['diagnosis', has('diagnosis')],
    ['warranty', has('warranty')],
    ['>= 2 quote', events.filter((e) => e.type === 'quote').length >= 2],
    ['guard budget', has('guard', (e) => e.data?.kind === 'budget')],
    ['guard no_answer', has('guard', (e) => e.data?.kind === 'no_answer')],
    ['best_deal', has('best_deal')],
    ['order_confirmed', has('order_confirmed')],
    ['install_step', has('install_step')],
    ['fix_verified', has('fix_verified')],
    ['>= 2 diagnosis_update', diagUpdates.length >= 2],
    ['thermal_fuse topProb >= 0.85', lastDiag?.data?.top === 'thermal_fuse' && finalProb >= 0.85],
  ];
  console.log('\nAssertions:');
  for (const [name, ok] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`\ndemo:sim FAILED: missing ${failed.map(([n]) => n).join(', ')}`);
    process.exit(1);
  }
  console.log(`\ndemo:sim PASSED in ${secs(t0)}`);
}

main().catch(async (err) => {
  console.error(`\ndemo:sim FAILED: ${(err as Error).message}`);
  try {
    const events = await api<Ev[]>('GET', '/events.json?since=0');
    console.error(`Last events:`);
    for (const e of events.slice(-25)) console.error(`  ${e.type.padEnd(16)} ${summarize(e)}`);
  } catch {
    // server unreachable
  }
  process.exit(1);
});
