// Operator admin dashboard: GET /admin (single HTML page) + /admin/api/*. All behind HTTP Basic.
import { createHash, timingSafeEqual } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express, NextFunction, Request, Response } from 'express';
import { DATA_DIR, config, modeFor } from '../config.ts';
import type { CallCtx } from '../contracts.ts';
import { calls } from '../calls.ts';
import { dialer, partyName, safeRoster } from '../dialer.ts';
import { maskPhone, onEvent } from '../events.ts';
import { jobs } from '../jobs.ts';
import { orchestrator } from '../orchestrator.ts';
import type { FixieEvent, Job, Lane } from '../types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, '..', '..', 'public', 'admin', 'index.html');
const LOG_FILE = process.env.ADMIN_LOG_FILE ?? '/var/log/fixie-server.log';
const CUSTOMERS_FILE = join(DATA_DIR, 'customers.json');

// ---------- auth ----------
const sha = (s: string) => createHash('sha256').update(s).digest();
const safeEq = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

function basicAuth(req: Request, res: Response, next: NextFunction) {
  const user = process.env.ADMIN_USER || 'bao';
  const pass = process.env.ADMIN_PASS || 'bao';
  const m = /^Basic\s+(.+)$/i.exec(req.header('authorization') ?? '');
  const decoded = m ? Buffer.from(m[1]!, 'base64').toString('utf8') : '';
  const i = decoded.indexOf(':');
  const u = i >= 0 ? decoded.slice(0, i) : '';
  const p = i >= 0 ? decoded.slice(i + 1) : '';
  const okUser = safeEq(u, user);
  const okPass = safeEq(p, pass);
  if (!(okUser && okPass)) {
    res.set('WWW-Authenticate', 'Basic realm="Fixie admin", charset="UTF-8"').status(401).send('Authentication required');
    return;
  }
  next();
}

/** Mutating routes need a custom header, which a cross-site form post cannot set (Basic creds are auto-sent by browsers). */
function ui(req: Request, res: Response, next: NextFunction) {
  if (req.header('x-admin-ui') !== '1') return void res.status(400).json({ error: 'missing x-admin-ui header' });
  next();
}

// ---------- redaction ----------
const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|rk|whsec|key|tok|AC|SK)[-_][A-Za-z0-9_-]{12,}/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|AUTH)[A-Z0-9_]*)\s*[=:]\s*\S+/gi,
  /("(?:[^"]*(?:key|token|secret|password|authorization)[^"]*)"\s*:\s*)"[^"]*"/gi,
  /\b(?=[A-Za-z_-]*\d)(?=[\d_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g,
];
const PHONEISH = /\+?\d[\d\s().-]{8,}\d/g;

export function redact(text: string): string {
  let out = text;
  out = out.replace(SECRET_PATTERNS[3]!, '$1"[redacted]"');
  out = out.replace(SECRET_PATTERNS[2]!, '$1=[redacted]');
  for (const re of [SECRET_PATTERNS[0]!, SECRET_PATTERNS[1]!, SECRET_PATTERNS[4]!]) out = out.replace(re, '[redacted]');
  out = out.replace(PHONEISH, (m) => (m.replace(/\D/g, '').length >= 10 ? maskPhone(m) : m));
  return out.replace(/\d{10,}/g, (m) => maskPhone(m));
}

/** Deep-clone JSON with phone-looking keys/values masked and secrets redacted. */
function sanitize(v: unknown): unknown {
  if (typeof v === 'string') return redact(v);
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) o[k.replace(/\D/g, '').length >= 10 ? maskPhone(k) : redact(k)] = sanitize(val);
    return o;
  }
  return v;
}

// ---------- in-process observation (transcript tails, guards) ----------
interface TLine { ts: string; speaker: string; text: string }
interface GuardRow { ts: string; kind: string; action: string; reason: string; lane?: string }
const transcripts = new Map<string, TLine[]>();
const guardsByJob = new Map<string, GuardRow[]>();

onEvent((ev: FixieEvent) => {
  if (ev.type === 'transcript') {
    const id = String(ev.data.callId ?? '');
    if (!id) return;
    const arr = transcripts.get(id) ?? [];
    arr.push({ ts: ev.ts, speaker: String(ev.data.speaker ?? ev.data.lane ?? ''), text: redact(String(ev.data.text ?? '')) });
    if (arr.length > 8) arr.shift();
    transcripts.set(id, arr);
  } else if (ev.type === 'guard' && ev.jobId) {
    const arr = guardsByJob.get(ev.jobId) ?? [];
    arr.push({
      ts: ev.ts,
      kind: String(ev.data.kind ?? ''),
      action: String(ev.data.action ?? ''),
      reason: redact(String(ev.data.reason ?? ev.data.detail ?? '')),
      lane: ev.data.lane ? String(ev.data.lane) : undefined,
    });
    if (arr.length > 20) arr.shift();
    guardsByJob.set(ev.jobId, arr);
  }
});

// ---------- views ----------
const LANES: Lane[] = ['user', 'warranty', 'supplier', 'delivery', 'tech'];
const errMsg = (e: unknown) => ((e as Error)?.message ?? String(e)).slice(0, 300);

function allCalls(): CallCtx[] {
  const seen = new Map<string, CallCtx>();
  for (const c of calls.live()) seen.set(c.callId, c);
  for (const j of jobs.all()) for (const c of calls.forJob(j.id)) seen.set(c.callId, c);
  return [...seen.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function callView(c: CallCtx) {
  const job = c.jobId ? jobs.get(c.jobId) : undefined;
  const rec = job?.calls.find((r) => r.callId === c.callId);
  return {
    callId: c.callId,
    jobId: c.jobId,
    lane: c.lane,
    party: partyName(job, c.lane, c.vendorId),
    phone: maskPhone(c.to),
    state: c.state,
    mode: c.mode,
    createdAt: c.createdAt,
    liveAt: c.liveAt ?? null,
    durationSec: rec?.durationSec ?? null,
    endedReason: rec?.endedReason ?? null,
    maxSec: c.maxSec,
    attempt: c.attempt,
    quoted: c.quoted,
    transcript: transcripts.get(c.callId) ?? [],
  };
}

function jobView(j: Job) {
  const quote = (q: Job['quotes'][number]) => ({
    supplier: q.supplier,
    price: q.price,
    shipping: q.shipping,
    landedTotal: q.landedTotal,
    inStock: q.inStock,
    eta: q.eta,
    identicalPart: q.identicalPart,
    rejectedReason: q.rejectedReason ?? null,
  });
  return {
    id: j.id,
    kind: j.kind,
    state: j.state,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    customer: { name: j.customer.name, phone: maskPhone(j.customer.phone) },
    appliance: j.appliance ?? null,
    model: j.model ?? null,
    symptom: j.symptom ?? null,
    part: j.part ? { partNumber: j.part.partNumber, name: j.part.name, safety: j.part.safety } : null,
    warranty: j.warranty ?? null,
    quotes: j.quotes.map(quote),
    bestDeal: j.bestDeal ? quote(j.bestDeal) : null,
    guards: guardsByJob.get(j.id) ?? [],
    diagnosis: j.diagnosis
      ? { faultTree: j.diagnosis.faultTree, posterior: j.diagnosis.posterior, observations: j.diagnosis.observations, unknowns: j.diagnosis.unknowns }
      : null,
    agentCostUsd: j.agentCostUsd,
    spendCap: config.spendCap,
    guardedCalls: j.guardedCalls,
    reservedMinutes: j.reservedMinutes,
    installStep: j.installStep ?? null,
    fault: j.fault ? { asset: j.fault.asset, code: j.fault.code, site: j.fault.site } : null,
    notes: j.notes.slice(-5).map(redact),
  };
}

function tailLog(lines: number): string[] {
  if (!existsSync(LOG_FILE)) return [`(no log file at ${LOG_FILE})`];
  let fd: number | undefined;
  try {
    fd = openSync(LOG_FILE, 'r');
    const size = fstatSync(fd).size;
    const len = Math.min(size, 96 * 1024);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8').split('\n').filter(Boolean).slice(-lines).map((l) => redact(l).slice(0, 600));
  } catch (e) {
    return [`(cannot read log: ${errMsg(e)})`];
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function rosterView() {
  const r = safeRoster();
  if (!r) return null;
  const row = (e: { id: string; name: string; phone: string; lane: Lane; mode?: 'live' | 'sim' }) => ({
    id: e.id,
    name: e.name,
    lane: e.lane,
    phone: maskPhone(e.phone),
    mode: config.dryRun ? 'sim' : (e.mode ?? modeFor(e.lane)),
    override: config.dryRun ? null : (e.mode ?? null),
  });
  return [r.user, r.warranty, ...r.suppliers, ...(r.tech ? [r.tech] : [])].map(row);
}

function customersView(): { exists: boolean; data: unknown } {
  if (!existsSync(CUSTOMERS_FILE)) return { exists: false, data: null };
  try {
    return { exists: true, data: sanitize(JSON.parse(readFileSync(CUSTOMERS_FILE, 'utf8'))) };
  } catch (e) {
    return { exists: true, data: { error: `unreadable: ${errMsg(e)}` } };
  }
}

function systemView() {
  return {
    ok: true,
    dryRun: config.dryRun,
    publicUrl: config.publicUrl || null,
    uptimeSec: Math.round(process.uptime()),
    pid: process.pid,
    port: config.port,
    modes: Object.fromEntries(LANES.map((l) => [l, modeFor(l)])),
    caps: config.caps,
    spendCap: config.spendCap,
    roster: rosterView(),
    log: tailLog(50),
  };
}

// ---------- routes ----------
export function register(app: Express): void {
  app.use('/admin', basicAuth);

  app.get(['/admin', '/admin/'], (_req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send(readFileSync(PAGE, 'utf8'));
  });

  app.get('/admin/api/state', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      now: Date.now(),
      calls: allCalls().map(callView),
      jobs: jobs.all().map(jobView).reverse(),
      system: systemView(),
      customers: customersView(),
    });
  });
  app.get('/admin/api/calls', (_req, res) => void res.json({ now: Date.now(), calls: allCalls().map(callView) }));
  app.get('/admin/api/jobs', (_req, res) => void res.json(jobs.all().map(jobView).reverse()));
  app.get('/admin/api/system', (_req, res) => void res.json(systemView()));
  app.get('/admin/api/customers', (_req, res) => void res.json(customersView()));

  app.post('/admin/api/calls/:id/end', ui, async (req, res) => {
    const id = String(req.params.id);
    if (!calls.get(id)) return void res.status(404).json({ error: 'unknown call' });
    try {
      await dialer.endCall(id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/admin/api/jobs/:id/stop', ui, async (req, res) => {
    const id = String(req.params.id);
    if (!jobs.get(id)) return void res.status(404).json({ error: 'unknown job' });
    try {
      await orchestrator.stopJob(id, 'Stopped from the admin dashboard.');
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/admin/api/jobs/:id/delivered', ui, async (req, res) => {
    const id = String(req.params.id);
    const job = jobs.get(id);
    if (!job) return void res.status(404).json({ error: 'unknown job' });
    if (job.state !== 'ORDERED') return void res.status(409).json({ error: `job is ${job.state}, not ORDERED` });
    try {
      await orchestrator.onDelivered(id);
      res.json({ ok: true });
    } catch (e) {
      res.status(409).json({ error: errMsg(e) });
    }
  });

  app.post('/admin/api/reset', ui, (_req, res) => {
    orchestrator.resetAll();
    transcripts.clear();
    guardsByJob.clear();
    res.json({ ok: true });
  });
}
