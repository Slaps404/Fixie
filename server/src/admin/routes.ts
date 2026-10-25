// Operator admin dashboard: GET /admin (single HTML page) + /admin/api/*. Behind HTTP Basic or the x-admin token.
import { createHash, timingSafeEqual } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { config, modeFor } from '../config.ts';
import type { CallCtx } from '../contracts.ts';
import { calls } from '../calls.ts';
import { dialer, partyName, safeRoster } from '../dialer.ts';
import { jobs } from '../jobs.ts';
import { orchestrator } from '../orchestrator.ts';
import { sendWhatsApp, whatsappEnabled } from '../notify/whatsapp.ts';
import { onEvent, maskPhone } from '../events.ts';
import type { Job, Lane } from '../types.ts';
import { sendSms } from '../vision/twilio.ts';
import { buildDirectory } from './directory.ts';
import { recordMessage, type MessageChannel, type StoredMessage } from './messages.ts';
import { clearObserved, guardsFor, redact, transcriptFor } from './observe.ts';
import { channels, customerView, directoryView, messageView, messagesView, ordersView, responsesView, showFor, type Show } from './views.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, '..', '..', 'public', 'admin', 'index.html');
const LOG_FILE = process.env.ADMIN_LOG_FILE ?? '/var/log/fixie-server.log';

// ---------- auth ----------
const sha = (s: string) => createHash('sha256').update(s).digest();
const safeEq = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

/** The site's server-side proxy authenticates with x-admin; browsers hitting /admin directly use Basic. */
function adminAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header('x-admin');
  if (token && config.adminToken && safeEq(token, config.adminToken)) return next();
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

// ---------- views ----------
const LANES: Lane[] = ['user', 'warranty', 'supplier', 'delivery', 'tech'];
const errMsg = (e: unknown) => ((e as Error)?.message ?? String(e)).slice(0, 300);

function allCalls(): CallCtx[] {
  const seen = new Map<string, CallCtx>();
  for (const c of calls.live()) seen.set(c.callId, c);
  for (const j of jobs.all()) for (const c of calls.forJob(j.id)) seen.set(c.callId, c);
  return [...seen.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function callView(c: CallCtx, show: Show) {
  const job = c.jobId ? jobs.get(c.jobId) : undefined;
  const rec = job?.calls.find((r) => r.callId === c.callId);
  return {
    callId: c.callId,
    jobId: c.jobId,
    lane: c.lane,
    party: partyName(job, c.lane, c.vendorId),
    phone: show(c.to),
    state: c.state,
    mode: c.mode,
    createdAt: c.createdAt,
    liveAt: c.liveAt ?? null,
    durationSec: rec?.durationSec ?? null,
    endedReason: rec?.endedReason ?? null,
    maxSec: c.maxSec,
    attempt: c.attempt,
    quoted: c.quoted,
    transcript: transcriptFor(c.callId),
  };
}

function jobView(j: Job, show: Show) {
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
    customer: { name: j.customer.name, phone: show(j.customer.phone) },
    appliance: j.appliance ?? null,
    model: j.model ?? null,
    symptom: j.symptom ?? null,
    part: j.part ? { partNumber: j.part.partNumber, name: j.part.name, safety: j.part.safety } : null,
    warranty: j.warranty ?? null,
    quotes: j.quotes.map(quote),
    bestDeal: j.bestDeal ? quote(j.bestDeal) : null,
    guards: guardsFor(j.id),
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

function rosterView(show: Show) {
  const r = safeRoster();
  if (!r) return null;
  const row = (e: { id: string; name: string; phone: string; lane: Lane; mode?: 'live' | 'sim' }) => ({
    id: e.id,
    name: e.name,
    lane: e.lane,
    phone: show(e.phone),
    mode: config.dryRun ? 'sim' : (e.mode ?? modeFor(e.lane)),
    override: config.dryRun ? null : (e.mode ?? null),
  });
  return [r.user, r.warranty, ...r.suppliers, ...(r.tech ? [r.tech] : [])].map(row);
}

function systemView(show: Show) {
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
    roster: rosterView(show),
    log: tailLog(50),
  };
}

// ---------- sending ----------
const CHANNELS: MessageChannel[] = ['whatsapp', 'sms'];
const MAX_BODY = 1000;

type Delivery = Pick<StoredMessage, 'status' | 'reason'>;

async function deliver(channel: MessageChannel, phone: string, body: string): Promise<Delivery> {
  if (config.dryRun) return { status: 'dry_run', reason: 'Dry run: not sent' };
  if (channel === 'sms') {
    const r = await sendSms(phone, body);
    return { status: r.sent ? 'sent' : 'failed', reason: r.reason };
  }
  if (!whatsappEnabled()) return { status: 'failed', reason: 'WhatsApp is not configured on this server' };
  // sendWhatsApp reports failure only as a null return plus a note event; read the detail from that event.
  let detail = '';
  const off = onEvent((ev) => {
    if (ev.type === 'note' && ev.data.kind === 'whatsapp_failed' && ev.data.to === maskPhone(phone)) {
      detail = [ev.data.detail, ev.data.code != null ? `code ${String(ev.data.code)}` : ''].filter(Boolean).join(' ');
    }
  });
  try {
    // jobId stays null: with one, sendWhatsApp's own note event would be logged a second time as an agent message.
    const sid = await sendWhatsApp(phone, body, null);
    return sid ? { status: 'sent', reason: null } : { status: 'failed', reason: detail || 'WhatsApp send failed' };
  } finally {
    off();
  }
}

// ---------- routes ----------
export function register(app: Express): void {
  app.use('/admin', adminAuth);
  const reveal = (req: Request) => showFor(req.query.reveal === '1');

  app.get(['/admin', '/admin/'], (_req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send(readFileSync(PAGE, 'utf8'));
  });

  app.get('/admin/api/state', (req, res) => {
    const show = reveal(req);
    const dir = buildDirectory();
    res.set('Cache-Control', 'no-store').json({
      now: Date.now(),
      calls: allCalls().map((c) => callView(c, show)),
      jobs: jobs.all().map((j) => jobView(j, show)).reverse(),
      system: systemView(show),
      customers: dir.customers.map((c) => customerView(c, show)),
      orders: ordersView(dir, show),
      responses: responsesView(),
      messages: messagesView(dir, show),
      directory: dir.entries.map((e) => directoryView(e, show)),
      channels: channels(),
    });
  });
  app.get('/admin/api/calls', (req, res) => void res.json({ now: Date.now(), calls: allCalls().map((c) => callView(c, reveal(req))) }));
  app.get('/admin/api/jobs', (req, res) => void res.json(jobs.all().map((j) => jobView(j, reveal(req))).reverse()));
  app.get('/admin/api/system', (req, res) => void res.json(systemView(reveal(req))));
  app.get('/admin/api/customers', (req, res) => void res.json(buildDirectory().customers.map((c) => customerView(c, reveal(req)))));

  app.post('/admin/api/messages', ui, express.json({ limit: '16kb' }), async (req, res) => {
    const { to, channel, body: rawBody } = (req.body ?? {}) as Record<string, unknown>;
    const body = typeof rawBody === 'string' ? rawBody.trim() : '';
    if (typeof to !== 'string' || !CHANNELS.includes(channel as MessageChannel)) {
      return void res.status(400).json({ error: "need { to: directory key, channel: 'whatsapp' | 'sms', body }" });
    }
    if (!body || body.length > MAX_BODY) return void res.status(400).json({ error: `body must be 1..${MAX_BODY} characters` });
    const dir = buildDirectory();
    const entry = dir.byKey.get(to);
    if (!entry) return void res.status(400).json({ error: 'unknown recipient: send a directory key, never a phone number' });
    if (!entry.textable) return void res.status(400).json({ error: `${entry.name} cannot be texted` });
    const result = await deliver(channel as MessageChannel, entry.phone, body);
    const stored = recordMessage({
      direction: 'out',
      channel: channel as MessageChannel,
      phone: entry.phone,
      body,
      ...result,
      source: 'admin',
      jobId: entry.jobIds[0] ?? null,
    });
    res.json({ ok: result.status !== 'failed', message: messageView(stored, dir, reveal(req)) });
  });

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
    clearObserved();
    res.json({ ok: true });
  });
}
