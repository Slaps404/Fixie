// Verification harness: typecheck, unit tests, then a scenario matrix against a real child server
// (DRY_RUN=1 sim lanes, real HTTP + /vapi/webhook path). Prints a table, exits 1 on any failure.
// Usage: npm run verify            (VERIFY_PORT=3917 VERIFY_KEEP=1 to keep temp files)
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const EXAMPLE_ROSTER = join(SERVER_DIR, 'data', 'roster.example.json');
const REAL_EVENTS_LOG = join(SERVER_DIR, 'data', 'events.jsonl');
const ADMIN = 'verify-admin-token';
const SECRET = 'verify-webhook-secret';

// ---------- tiny utils ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const log = (m: string) => console.log(`[verify ${since()}] ${m}`);

interface Ev {
  id: number;
  ts: string;
  jobId: string | null;
  type: string;
  data: Record<string, any>;
  simulated?: boolean;
}
type Job = Record<string, any>;
type RosterJson = {
  user: Record<string, any>;
  warranty: Record<string, any>;
  suppliers: Array<Record<string, any>>;
  tech?: Record<string, any>;
};

class Check {
  fails: string[] = [];
  passes = 0;
  ok(name: string, cond: unknown, detail = ''): boolean {
    if (cond) {
      this.passes++;
      return true;
    }
    this.fails.push(`${name}${detail ? `: ${detail}` : ''}`);
    return false;
  }
}

// ---------- step 1/2: tsc + npm test ----------
function runCmd(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: SERVER_DIR, env, shell: false });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', (e) => resolve({ code: 127, out: String(e) }));
    p.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

// ---------- child server ----------
let child: ChildProcess | undefined;
let childLog = '';
let tmp = '';
let BASE = '';
let eventsLogBackup: Buffer | null = null;
let cleaned = false;

function freePort(preferred: number): Promise<number> {
  const tryPort = (p: number) =>
    new Promise<number>((resolve, reject) => {
      const s = createServer();
      s.once('error', reject);
      s.listen(p, '127.0.0.1', () => {
        const port = (s.address() as { port: number }).port;
        s.close(() => resolve(port));
      });
    });
  return tryPort(preferred).catch(() => tryPort(0));
}

function cleanup(): void {
  if (cleaned) return;
  cleaned = true;
  if (child && child.exitCode === null) {
    try {
      child.kill('SIGTERM');
      setTimeout(() => child?.exitCode === null && child.kill('SIGKILL'), 1500).unref();
    } catch {
      // already gone
    }
  }
  // The child appends to the real data/events.jsonl (no env override exists); put it back the way it was.
  try {
    if (eventsLogBackup) writeFileSync(REAL_EVENTS_LOG, eventsLogBackup);
    else if (existsSync(REAL_EVENTS_LOG) && eventsLogBackup === null && backedUpAbsent) rmSync(REAL_EVENTS_LOG);
  } catch {
    // best effort
  }
  if (tmp && !process.env.VERIFY_KEEP) {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}
let backedUpAbsent = false;
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    console.error(`\n[verify] ${sig}: killing child server`);
    cleanup();
    process.exit(130);
  });
}
process.on('uncaughtException', (e) => {
  console.error('[verify] uncaught:', e);
  cleanup();
  process.exit(1);
});

async function startServer(): Promise<void> {
  tmp = mkdtempSync(join(tmpdir(), 'fixie-verify-'));
  mkdirSync(tmp, { recursive: true });
  if (existsSync(REAL_EVENTS_LOG)) eventsLogBackup = readFileSync(REAL_EVENTS_LOG);
  else backedUpAbsent = true;
  const port = await freePort(Number(process.env.VERIFY_PORT) || 3917);
  BASE = `http://127.0.0.1:${port}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DRY_RUN: '1',
    SIM_SPEED: '8',
    PORT: String(port),
    ADMIN_TOKEN: ADMIN,
    VAPI_WEBHOOK_SECRET: SECRET,
    JOBS_FILE: join(tmp, 'jobs.json'),
    ROSTER_FILE: join(tmp, 'roster.json'),
    VAPI_API_KEY: '',
    PUBLIC_URL: '',
    // Pin the caps the scenarios depend on, regardless of the developer's .env.
    CAP_BUDGET: '40',
    CAP_AGENT_SPEND: '3',
    CAP_MAX_CALLS: '8',
    CAP_MAX_MINUTES: '20',
    CAP_MAX_CALLS_PER_VENDOR: '2',
    CAP_STUCK_SECONDS: '3',
    CAP_SOURCING_TIMEOUT_SECONDS: '60',
    CAP_SOURCING_FALLBACK_SECONDS: '25',
  };
  writeRoster(() => {});
  child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: SERVER_DIR, env });
  child.stdout?.on('data', (d) => (childLog += d));
  child.stderr?.on('data', (d) => (childLog += d));
  child.on('exit', (code) => {
    if (!cleaned) childLog += `\n[child exited code=${code}]\n`;
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early (code ${child.exitCode})`);
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) {
        log(`server up at ${BASE} (${JSON.stringify(await r.json())})`);
        return;
      }
    } catch {
      // not yet
    }
    await sleep(250);
  }
  throw new Error('server did not answer /health within 30 s');
}

function writeRoster(mod: (r: RosterJson) => void): void {
  const r = JSON.parse(readFileSync(EXAMPLE_ROSTER, 'utf8')) as RosterJson;
  mod(r);
  writeFileSync(join(tmp, 'roster.json'), JSON.stringify(r, null, 2));
}
const supplier = (r: RosterJson, id: string) => r.suppliers.find((s) => s.id === id)!;

// ---------- http helpers ----------
interface Resp {
  status: number;
  text: string;
  json: any;
  ms: number;
}
async function http(method: string, path: string, opts: { admin?: boolean | string; secret?: boolean | string; body?: unknown } = {}): Promise<Resp> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.admin) headers['x-admin'] = typeof opts.admin === 'string' ? opts.admin : ADMIN;
  if (opts.secret) headers['x-vapi-secret'] = typeof opts.secret === 'string' ? opts.secret : SECRET;
  const t = Date.now();
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, text, json, ms: Date.now() - t };
}
const admin = (method: string, path: string, body?: unknown) => http(method, path, { admin: true, body });
const getEvents = async (): Promise<Ev[]> => (await http('GET', '/events.json?since=0')).json as Ev[];
const getJobs = async (): Promise<Job[]> => (await http('GET', '/jobs')).json as Job[];
const getJob = async (id: string): Promise<Job> => (await http('GET', `/jobs/${id}`)).json as Job;
const latestJob = async (): Promise<Job | undefined> => [...(await getJobs())].sort((a, b) => b.createdAt - a.createdAt)[0];

async function poll<T>(what: string, fn: () => Promise<T | undefined | false>, timeoutMs = 60_000, everyMs = 150): Promise<T> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    await sleep(everyMs);
  }
  throw new Error(`timed out after ${timeoutMs / 1000}s waiting for ${what}`);
}
const waitState = (states: string | string[], timeoutMs = 60_000) => {
  const want = Array.isArray(states) ? states : [states];
  return poll<Job>(`job state ${want.join('|')}`, async () => {
    const j = await latestJob();
    return j && want.includes(j.state) ? j : undefined;
  }, timeoutMs);
};
const waitJobExists = () => poll<Job>('a job to exist', async () => latestJob(), 30_000, 100);

async function reset(): Promise<void> {
  const r = await admin('POST', '/demo/reset');
  if (r.status !== 200) throw new Error(`/demo/reset -> ${r.status} ${r.text}`);
  await sleep(300);
  const jobs = await getJobs();
  if (jobs.length) throw new Error(`reset left ${jobs.length} job(s)`);
}
async function intake(body: Record<string, unknown> = {}): Promise<void> {
  const r = await admin('POST', '/demo/sim-intake', body);
  if (r.status !== 200) throw new Error(`/demo/sim-intake -> ${r.status} ${r.text}`);
}
const ofType = (evs: Ev[], type: string, pred: (e: Ev) => boolean = () => true) => evs.filter((e) => e.type === type && pred(e));
const guardKinds = (evs: Ev[]) => ofType(evs, 'guard').map((e) => `${e.data.kind}/${e.data.action}`);

/** Every string anywhere in a JSON value (numbers like epoch-ms timestamps are deliberately skipped). */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (out.push(k), strings(x, out));
  return out;
}
const fullPhones = (v: unknown) => strings(v).filter((s) => /\d{10,}/.test(s.replace(/[\s\-().]/g, '')) && !/^\d{4}-\d\d-\d\dT/.test(s));

// ---------- raw Vapi-shaped webhook posts ----------
let rawSeq = 0;
function rawTool(callId: string, callName: string, name: string, args: Record<string, unknown>, secret: string | boolean = true) {
  const id = `call_raw_${++rawSeq}`;
  const fn = { name, arguments: args };
  return http('POST', '/vapi/webhook', {
    secret,
    body: {
      message: {
        type: 'tool-calls',
        call: { id: callId, type: 'outboundPhoneCall', name: callName, customer: { number: '+16195550100' } },
        toolCallList: [{ id, type: 'function', function: fn }],
        toolWithToolCallList: [{ type: 'function', function: { name }, toolCall: { id, type: 'function', function: fn } }],
      },
    },
  });
}
const resultText = (r: Resp) => String(r.json?.results?.[0]?.result ?? r.json?.results?.[0]?.error ?? '');

// ---------- scenarios ----------
interface Scenario {
  name: string;
  run: (c: Check, note: (s: string) => void) => Promise<void>;
}

const scenarios: Scenario[] = [
  {
    name: 'happy path',
    async run(c, note) {
      writeRoster(() => {});
      await reset();
      await intake();
      await waitState('ORDERED', 90_000);
      const d = await admin('POST', '/simulate/delivered', {});
      c.ok('POST /simulate/delivered 200', d.status === 200, `${d.status} ${d.text}`);
      const job = await waitState('FIXED', 90_000);
      await sleep(800);
      const evs = await getEvents();
      c.ok('state FIXED', job.state === 'FIXED');
      c.ok('guard budget fired', ofType(evs, 'guard', (e) => e.data.kind === 'budget').length >= 1, guardKinds(evs).join(','));
      c.ok('guard no_answer fired', ofType(evs, 'guard', (e) => e.data.kind === 'no_answer').length >= 1, guardKinds(evs).join(','));
      const best = ofType(evs, 'best_deal')[0];
      c.ok('best_deal exists', !!best);
      c.ok('best_deal supplier PartsDirect', /PartsDirect/i.test(String(best?.data.supplier)), String(best?.data.supplier));
      c.ok('best_deal landed 13.05', Math.abs(Number(best?.data.landedTotal) - 13.05) < 0.005, String(best?.data.landedTotal));
      const oc = ofType(evs, 'order_confirmed')[0];
      c.ok('order_confirmed confirmedBy voice', oc?.data.confirmedBy === 'voice', JSON.stringify(oc?.data));
      c.ok('install_step + fix_verified emitted', ofType(evs, 'install_step').length > 0 && ofType(evs, 'fix_verified').length === 1);
      c.ok('every call_started has call_ended', ofType(evs, 'call_started').every((s) => ofType(evs, 'call_ended', (e) => e.data.callId === s.data.callId).length === 1),
        'a call never reported ended (or ended twice)');
      // Minutes ledger: once every call has settled, reservedMinutes must equal the actual minutes used.
      const fin = await getJob(job.id);
      const actual = fin.calls.reduce((s: number, x: any) => s + (Number(x.durationSec) || 0), 0) / 60;
      c.ok('minutes ledger settles to actual use', Math.abs(fin.reservedMinutes - actual) < 0.05, `reservedMinutes=${fin.reservedMinutes.toFixed(2)} actual=${actual.toFixed(2)}`);
      const series = ofType(evs, 'metrics').map((e) => e.data.minutes);
      note(`metrics.minutes series: ${series.join(' -> ')} (cap ${ofType(evs, 'metrics')[0]?.data.maxMinutes}); rises while a call is in flight because it counts the call's reserved max, then drops on settle`);
      c.ok('metrics.minutes never negative / over cap', series.every((m: number) => m >= 0 && m <= 20), series.join(','));
    },
  },
  {
    name: 'covered warranty',
    async run(c) {
      writeRoster((r) => (r.warranty.simPersona = 'covered'));
      await reset();
      await intake();
      await waitState(['ORDERED', 'ESCALATED', 'STOPPED', 'DECLINED'], 90_000);
      const job = await latestJob();
      const evs = await getEvents();
      const roster = JSON.parse(readFileSync(join(tmp, 'roster.json'), 'utf8')) as RosterJson;
      c.ok('state ORDERED', job?.state === 'ORDERED', String(job?.state));
      const best = ofType(evs, 'best_deal')[0];
      c.ok('best_deal is warranty, $0', best?.data.landedTotal === 0 && best?.data.vendorId === roster.warranty.id, JSON.stringify(best?.data));
      c.ok('warranty event covered', ofType(evs, 'warranty', (e) => e.data.covered === true).length === 1);
      const oc = ofType(evs, 'order_confirmed');
      c.ok('order_confirmed exactly once, from warranty not a supplier', oc.length === 1 && oc[0].data.vendorId === roster.warranty.id && Number(oc[0].data.landedTotal) === 0, JSON.stringify(oc.map((e) => e.data)));
      c.ok('no supplier purchase', !oc.some((e) => roster.suppliers.some((s) => s.id === e.data.vendorId)));
    },
  },
  {
    name: 'all over budget',
    async run(c) {
      writeRoster((r) => {
        supplier(r, 'valley').simPersona = 'quote:55.00:4.00:in_stock:Friday';
        supplier(r, 'partsdirect').simPersona = 'quote:45.00:3.00:in_stock:Tuesday';
        supplier(r, 'coast').simPersona = 'quote:60.00:5.00:in_stock:Thursday';
      });
      await reset();
      await intake();
      await waitState(['ESCALATED', 'ORDERED', 'AWAITING_CONFIRMATION', 'STOPPED'], 90_000);
      await sleep(2500); // a (wrong) callback would start within this window
      const job = await latestJob();
      const evs = await getEvents();
      c.ok('state ESCALATED', job?.state === 'ESCALATED', String(job?.state));
      c.ok('3 budget guards', ofType(evs, 'guard', (e) => e.data.kind === 'budget').length >= 3, guardKinds(evs).join(','));
      c.ok('no best_deal', ofType(evs, 'best_deal').length === 0);
      c.ok('no callback call placed', ofType(evs, 'call_started', (e) => e.data.lane === 'user').length === 0);
      c.ok('no order_confirmed', ofType(evs, 'order_confirmed').length === 0);
    },
  },
  {
    name: 'stuck supplier',
    async run(c) {
      writeRoster((r) => {
        supplier(r, 'valley').simPersona = 'hold';
        supplier(r, 'coast').simPersona = 'hold';
      });
      await reset();
      await intake();
      const job = await waitState(['AWAITING_CONFIRMATION', 'ORDERED', 'ESCALATED', 'STOPPED'], 90_000);
      await sleep(500);
      const evs = await getEvents();
      const stuck = ofType(evs, 'guard', (e) => e.data.kind === 'stuck');
      c.ok('guard stuck fired (x2: valley + coast)', stuck.length >= 2, `${stuck.length}; guards=${guardKinds(evs).join(',')}`);
      for (const g of stuck) {
        const cid = g.data.callId;
        c.ok(`stuck call ${cid} was ended`, ofType(evs, 'call_ended', (e) => e.data.callId === cid).length === 1);
      }
      c.ok('held supplier never produced a quote', ofType(evs, 'quote', (e) => /valley|coast/i.test(String(e.data.vendorId))).length === 0);
      c.ok('job still progressed to a deal (PartsDirect)', /PartsDirect/i.test(String(ofType(evs, 'best_deal')[0]?.data.supplier)), `state=${job.state}`);
    },
  },
  {
    name: 'declined order',
    async run(c) {
      writeRoster((r) => (r.user.simPersona = 'decline'));
      await reset();
      await intake();
      await waitState(['DECLINED', 'ORDERED', 'ESCALATED', 'STOPPED'], 90_000);
      await sleep(1500);
      const job = await latestJob();
      const evs = await getEvents();
      c.ok('state DECLINED', job?.state === 'DECLINED', String(job?.state));
      c.ok('order_declined emitted', ofType(evs, 'order_declined').length === 1);
      c.ok('no order_confirmed', ofType(evs, 'order_confirmed').length === 0);
      const d = await admin('POST', '/simulate/delivered', {});
      c.ok('delivery refused for a DECLINED job', d.status >= 400, `HTTP ${d.status}`);
    },
  },
  // TODO(product bug, not testable in sim): dialer.placeGuardedCall awaits provider.createCall (a ~1 s HTTP POST in live mode)
  // before registering the call. A kill switch pressed in that window misses the in-flight call: orchestrator.stop() only
  // ends calls already in the registry, so the call rings and runs on a STOPPED job. Sim createCall is instant, so this
  // scenario cannot reproduce it. Fix: in dialer after createCall, if job.state is STOPPED/ESCALATED, endCall(created.callId).
  {
    name: 'kill switch',
    async run(c) {
      writeRoster((r) => {
        supplier(r, 'valley').simPersona = 'hold';
        supplier(r, 'coast').simPersona = 'hold';
      });
      await reset();
      await intake();
      await poll('a held supplier call to be live', async () => ofType(await getEvents(), 'transcript', (e) => /hold/i.test(String(e.data.text))).length > 0, 60_000);
      const job = (await latestJob())!;
      const before = await getEvents();
      const started = ofType(before, 'call_started');
      c.ok('calls were in flight', started.length >= 1 && job.state === 'SOURCING', `state=${job.state} started=${started.length}`);
      const stop = await admin('POST', `/jobs/${job.id}/stop`, {});
      c.ok('POST /jobs/:id/stop 200', stop.status === 200, `${stop.status} ${stop.text.slice(0, 120)}`);
      await sleep(3500);
      const evs = await getEvents();
      const fin = await getJob(job.id);
      c.ok('state STOPPED', fin.state === 'STOPPED', fin.state);
      for (const s of ofType(evs, 'call_started')) {
        const ended = ofType(evs, 'call_ended', (e) => e.data.callId === s.data.callId).length;
        c.ok(`call ${s.data.callId} (${s.data.lane}) got call_ended`, ended === 1, `count=${ended}`);
      }
      c.ok('manual stop guard emitted', ofType(evs, 'guard', (e) => e.data.kind === 'manual' && e.data.action === 'stopped').length === 1);
      c.ok('no callback placed', ofType(evs, 'call_started', (e) => e.data.lane === 'user').length === 0);
      c.ok('no best_deal / order after stop', ofType(evs, 'best_deal').length === 0 && ofType(evs, 'order_confirmed').length === 0);
      c.ok('no new calls after stop', ofType(evs, 'call_started').length === started.length, `${started.length} -> ${ofType(evs, 'call_started').length}`);
    },
  },
  {
    name: 'safety keyword',
    async run(c) {
      writeRoster(() => {});
      await reset();
      await intake({ text: "My dryer stopped heating and there's a burning smell when it runs.", symptom: 'burning smell, no heat' });
      const job = await waitState(['ESCALATED', 'DIAGNOSED', 'SOURCING', 'ORDERED'], 60_000);
      await sleep(3500); // would-be sourcing calls would start within this window
      const evs = await getEvents();
      const fin = await getJob(job.id);
      c.ok('state ESCALATED', fin.state === 'ESCALATED', fin.state);
      c.ok('safety event pro_required', ofType(evs, 'safety', (e) => e.data.level === 'pro_required').length >= 1, JSON.stringify(ofType(evs, 'safety').map((e) => e.data.level)));
      c.ok('no install_step', ofType(evs, 'install_step').length === 0);
      c.ok('no sourcing calls', ofType(evs, 'call_started').length === 0);
      const note = fin.notes.join(' | ');
      c.ok('note records the safety keyword', /burn|Safety/i.test(note), note.slice(0, 120));
    },
  },
  {
    name: 'install gate',
    async run(c, note) {
      writeRoster((r) => r.suppliers.forEach((s) => (s.simPersona = 'hold'))); // keep the job alive in SOURCING
      await reset();
      await intake();
      const job = await poll<Job>('job with a part', async () => {
        const j = await latestJob();
        return j && ['DIAGNOSED', 'SOURCING', 'AWAITING_CONFIRMATION'].includes(j.state) ? j : undefined;
      }, 30_000, 100);
      const callId = 'sim_gate_1';
      const callName = `${job.id}|-|delivery`;
      const r1 = await rawTool(callId, callName, 'install_progress', { step: 7 });
      note(`gate reply: "${resultText(r1).slice(0, 140)}" (${r1.ms} ms)`);
      c.ok('webhook 200', r1.status === 200);
      c.ok('tool result says what is missing', /unplugged|vent/i.test(resultText(r1)) && /not yet|can't|first confirm/i.test(resultText(r1)), resultText(r1));
      c.ok('tool reply under 1 s', r1.ms < 1000, `${r1.ms} ms`);
      let evs = await getEvents();
      c.ok('no install_step for step 7', ofType(evs, 'install_step', (e) => e.data.step === 7).length === 0);
      c.ok('safety guard event emitted', ofType(evs, 'guard', (e) => e.data.kind === 'safety').length >= 1);
      // One ack is not enough.
      await rawTool(callId, callName, 'safety_ack', { kind: 'unplugged' });
      const r2 = await rawTool(callId, callName, 'install_progress', { step: 7 });
      evs = await getEvents();
      c.ok('still blocked after only "unplugged"', /vent/i.test(resultText(r2)) && ofType(evs, 'install_step', (e) => e.data.step === 7).length === 0, resultText(r2));
      // Both acks: the gate opens.
      await rawTool(callId, callName, 'safety_ack', { kind: 'vent_cleared' });
      const r3 = await rawTool(callId, callName, 'install_progress', { step: 7 });
      evs = await getEvents();
      c.ok('gate opens once both acks are in', ofType(evs, 'install_step', (e) => e.data.step === 7 && !e.data.skipped).length === 1, resultText(r3));
      await admin('POST', `/jobs/${job.id}/stop`, {});
    },
  },
  {
    name: 'fault (enterprise)',
    async run(c) {
      writeRoster(() => {});
      await reset();
      const r = await admin('POST', '/fault', {});
      c.ok('POST /fault 200', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`);
      const job = await waitState(['NOTIFIED', 'ESCALATED', 'STOPPED'], 90_000);
      await sleep(800);
      const evs = await getEvents();
      c.ok('state NOTIFIED', job.state === 'NOTIFIED', job.state);
      c.ok('fault event simulated', ofType(evs, 'fault')[0]?.simulated === true);
      c.ok('diagnosis simulated', ofType(evs, 'diagnosis')[0]?.simulated === true);
      const calls = ofType(evs, 'call_started');
      c.ok('tech call placed', calls.some((e) => e.data.lane === 'tech'), calls.map((e) => e.data.lane).join(','));
      c.ok('every call_started simulated', calls.length > 0 && calls.every((e) => e.simulated === true));
      c.ok('no full phone in fault events', fullPhones(evs).length === 0, fullPhones(evs).join(','));
      c.ok('no consumer callback', calls.every((e) => e.data.lane !== 'user'));
    },
  },
  {
    name: 'security',
    async run(c) {
      writeRoster(() => {});
      await reset();
      await intake();
      await poll('job with a recorded call', async () => {
        const j = await latestJob();
        return j && j.calls?.length > 0 ? j : undefined;
      }, 30_000, 100);
      const hook = { message: { type: 'status-update', status: 'ringing', call: { id: 'sim_sec_1', type: 'outboundPhoneCall' } } };
      const noSecret = await http('POST', '/vapi/webhook', { body: hook });
      c.ok('webhook without X-Vapi-Secret -> 401', noSecret.status === 401, `HTTP ${noSecret.status}`);
      const badSecret = await http('POST', '/vapi/webhook', { secret: 'wrong', body: hook });
      c.ok('webhook with wrong secret -> 401', badSecret.status === 401, `HTTP ${badSecret.status}`);
      const okSecret = await http('POST', '/vapi/webhook', { secret: true, body: hook });
      c.ok('webhook with right secret -> 200', okSecret.status === 200, `HTTP ${okSecret.status}`);
      const toolNoSecret = await rawTool('sim_sec_2', 'job_1|-|delivery', 'install_progress', { step: 1 }, false);
      c.ok('tool-calls without secret -> 401', toolNoSecret.status === 401, `HTTP ${toolNoSecret.status}`);
      const routes: Array<[string, string]> = [
        ['POST', '/demo/reset'],
        ['POST', '/demo/mode'],
        ['POST', '/demo/sim-intake'],
        ['POST', '/demo/test-call'],
        ['POST', '/fault'],
        ['POST', '/simulate/delivered'],
        ['POST', '/jobs/job_1/stop'],
      ];
      for (const [m, p] of routes) {
        const a = await http(m, p, { body: {} });
        c.ok(`${m} ${p} without x-admin -> 401`, a.status === 401, `HTTP ${a.status}`);
      }
      const wrong = await http('POST', '/demo/reset', { admin: 'nope', body: {} });
      c.ok('admin route with wrong token -> 401', wrong.status === 401, `HTTP ${wrong.status}`);
      c.ok('job survived the unauthorized reset attempts', (await getJobs()).length >= 1);
      const jobsRes = await http('GET', '/jobs');
      c.ok('GET /jobs has jobs to inspect', Array.isArray(jobsRes.json) && jobsRes.json.length > 0);
      c.ok('GET /jobs: no full phone numbers', fullPhones(jobsRes.json).length === 0, fullPhones(jobsRes.json).join(', '));
      c.ok('GET /jobs raw body: no +E.164 number', !/\+\d{10,}/.test(jobsRes.text));
      const one = await http('GET', `/jobs/${jobsRes.json?.[0]?.id}`);
      c.ok('GET /jobs/:id: no full phone numbers', one.status === 200 && fullPhones(one.json).length === 0);
      const evs = await http('GET', '/events.json?since=0');
      c.ok('GET /events.json: no full phone numbers', fullPhones(evs.json).length === 0, fullPhones(evs.json).slice(0, 3).join(', '));
      c.ok('GET /health is public', (await http('GET', '/health')).status === 200);
    },
  },
  {
    name: 'SSE /events',
    async run(c) {
      writeRoster(() => {});
      await reset();
      const got: Ev[] = [];
      const ac = new AbortController();
      const res = await fetch(`${BASE}/events`, { signal: ac.signal, headers: { Accept: 'text/event-stream' } });
      c.ok('SSE 200 text/event-stream', res.status === 200 && /text\/event-stream/.test(res.headers.get('content-type') ?? ''), `${res.status} ${res.headers.get('content-type')}`);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const pump = (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i: number;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const frame = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const data = frame.split('\n').find((l) => l.startsWith('data: '));
              if (data && frame.includes('event: fixie')) got.push(JSON.parse(data.slice(6)) as Ev);
            }
          }
        } catch {
          // aborted
        }
      })();
      try {
        await intake();
        await poll('SSE job_state event', async () => got.some((e) => e.type === 'job_state'), 30_000, 100);
        await poll('SSE call/transcript event', async () => got.some((e) => e.type === 'transcript' || e.type === 'call_started'), 30_000, 100).catch(() => undefined);
        c.ok('received job_state over SSE', got.some((e) => e.type === 'job_state'));
        c.ok('SSE events carry id/ts/type', got.every((e) => e.id > 0 && !!e.ts && !!e.type));
        const jobs = await getJobs();
        if (jobs[0]) await admin('POST', `/jobs/${jobs[0].id}/stop`, {});
      } finally {
        ac.abort();
        await pump;
      }
    },
  },
];

// ---------- main ----------
interface Row {
  step: string;
  ok: boolean;
  ms: number;
  detail: string;
}
const rows: Row[] = [];
const details: string[] = [];

async function main(): Promise<void> {
  // a. tsc
  let t = Date.now();
  const tsc = await runCmd('npx', ['--no-install', 'tsc', '--noEmit']);
  rows.push({ step: 'tsc --noEmit', ok: tsc.code === 0, ms: Date.now() - t, detail: tsc.code === 0 ? '' : tsc.out.trim().split('\n').slice(0, 3).join(' / ') });
  if (tsc.code) details.push(`--- tsc output ---\n${tsc.out.trim().slice(-3000)}`);

  // b. unit tests
  t = Date.now();
  const tmpUnit = mkdtempSync(join(tmpdir(), 'fixie-unit-'));
  const unit = await runCmd('npm', ['test', '--silent'], { ...process.env, JOBS_FILE: join(tmpUnit, 'jobs.json'), DRY_RUN: '1' });
  rmSync(tmpUnit, { recursive: true, force: true });
  const m = /# pass (\d+)/.exec(unit.out);
  const f = /# fail (\d+)/.exec(unit.out);
  rows.push({ step: 'npm test', ok: unit.code === 0, ms: Date.now() - t, detail: `${m?.[1] ?? '?'} pass, ${f?.[1] ?? '?'} fail` });
  if (unit.code) details.push(`--- npm test output (tail) ---\n${unit.out.trim().slice(-3500)}`);

  // c. scenario matrix
  try {
    await startServer();
    for (const s of scenarios) {
      const c = new Check();
      const notes: string[] = [];
      const ts = Date.now();
      log(`scenario: ${s.name}`);
      try {
        await s.run(c, (n) => notes.push(n));
      } catch (err) {
        c.fails.push(`aborted: ${(err as Error).message}`);
      }
      const ok = c.fails.length === 0;
      rows.push({ step: `scenario: ${s.name}`, ok, ms: Date.now() - ts, detail: ok ? `${c.passes} checks` : c.fails[0] });
      if (!ok) details.push(`--- ${s.name}: ${c.fails.length} failed, ${c.passes} passed ---\n${c.fails.map((x) => `  FAIL ${x}`).join('\n')}`);
      if (notes.length) details.push(`--- ${s.name}: notes ---\n${notes.map((x) => `  ${x}`).join('\n')}`);
    }
  } catch (err) {
    rows.push({ step: 'scenario server', ok: false, ms: 0, detail: (err as Error).message });
    details.push(`--- server log (tail) ---\n${childLog.slice(-3000)}`);
  } finally {
    cleanup();
  }

  const w = Math.max(...rows.map((r) => r.step.length));
  console.log('\nFixie verify\n');
  for (const r of rows) console.log(`${r.ok ? '✅' : '❌'}  ${r.step.padEnd(w)}  ${(r.ms / 1000).toFixed(1).padStart(5)}s  ${r.detail}`);
  const failed = rows.filter((r) => !r.ok).length;
  if (details.length) console.log(`\n${details.join('\n\n')}`);
  if (failed && childLog) console.log(`\n--- server log (last 40 lines) ---\n${childLog.trim().split('\n').slice(-40).join('\n')}`);
  console.log(failed ? `\n${failed} of ${rows.length} step(s) FAILED.` : `\nAll ${rows.length} steps passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`verify crashed: ${(err as Error).stack ?? err}`);
  cleanup();
  process.exit(1);
});
