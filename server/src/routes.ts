// WS-2: admin + public job routes.
import type { Express, NextFunction, Request, Response } from 'express';
import { config, getEpoch, modeFor, setMode } from './config.ts';
import type { Mode } from './contracts.ts';
import type { Job, Lane } from './types.ts';
import { emit, maskPhone } from './events.ts';
import { jobs } from './jobs.ts';
import { orchestrator } from './orchestrator.ts';
import { dialer, safeRoster } from './dialer.ts';
import { parts } from './parts.ts';
import { simProvider } from './vapi/sim.ts';

const LANES: Lane[] = ['user', 'warranty', 'supplier', 'delivery', 'tech'];

function admin(req: Request, res: Response, next: NextFunction) {
  if (req.header('x-admin') !== config.adminToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

/** Deep copy with every phone number masked. */
export function maskJob(job: Job): Job {
  const j = structuredClone(job) as Job;
  j.customer = { ...j.customer, phone: maskPhone(j.customer.phone) };
  j.calls = j.calls.map((c) => ({ ...c, to: maskPhone(c.to) }));
  if (j.fault?.techPhone) j.fault = { ...j.fault, techPhone: maskPhone(j.fault.techPhone) };
  return j;
}

const modes = () => Object.fromEntries(LANES.map((l) => [l, modeFor(l)]));
const errMsg = (err: unknown) => ((err as Error)?.message ?? String(err)).slice(0, 300);

/** Pull a jobId out of a plain or carrier-webhook-shaped body. */
function jobIdFrom(body: any): string | undefined {
  const cands = [body?.jobId, body?.metadata?.jobId, body?.data?.jobId, body?.data?.metadata?.jobId, body?.reference, body?.shipment?.reference];
  return cands.find((v) => typeof v === 'string' && v.length > 0);
}

export function register(app: Express): void {
  // ---------- public ----------
  app.get('/jobs', (_req, res) => {
    res.json(jobs.all().map(maskJob));
  });
  app.get('/jobs/:id', (req, res) => {
    const job = jobs.get(String(req.params.id));
    if (!job) return void res.status(404).json({ error: 'not found' });
    res.json(maskJob(job));
  });

  // ---------- admin ----------
  app.post('/simulate/delivered', admin, async (req, res) => {
    let jobId = jobIdFrom(req.body);
    if (!jobId) {
      const ordered = jobs.all().filter((j) => j.state === 'ORDERED').sort((a, b) => b.createdAt - a.createdAt);
      jobId = ordered[0]?.id;
    }
    if (!jobId) return void res.status(404).json({ error: 'no ORDERED job' });
    try {
      await orchestrator.onDelivered(jobId);
      res.json({ ok: true, jobId });
    } catch (err) {
      res.status(409).json({ error: errMsg(err), jobId });
    }
  });

  app.post('/fault', admin, async (req, res) => {
    const b = req.body ?? {};
    try {
      // The tech number comes only from roster.tech; techPhone in the body is ignored.
      const job = await orchestrator.startFault({
        asset: typeof b.asset === 'string' && b.asset ? b.asset : 'Terminal tractor YT-07',
        code: typeof b.code === 'string' && b.code ? b.code : 'SPN 3226 FMI 4',
        site: typeof b.site === 'string' && b.site ? b.site : 'Port of San Diego, 10th Ave Marine Terminal',
      });
      res.json({ ok: true, job: maskJob(job) });
    } catch (err) {
      res.status(400).json({ error: errMsg(err) });
    }
  });

  app.post('/jobs/:id/stop', admin, async (req, res) => {
    const id = String(req.params.id);
    if (!jobs.get(id)) return void res.status(404).json({ error: 'not found' });
    const reason = typeof req.body?.reason === 'string' && req.body.reason ? req.body.reason : 'Kill switch pressed. Stopped the job and ended its live calls.';
    await orchestrator.stopJob(id, reason);
    res.json({ ok: true, job: maskJob(jobs.get(id)!) });
  });

  app.post('/demo/reset', admin, (_req, res) => {
    orchestrator.resetAll();
    res.json({ ok: true, epoch: getEpoch() });
  });

  app.post('/demo/mode', admin, (req, res) => {
    const lane = req.body?.lane as Lane | 'all';
    const mode = req.body?.mode as Mode;
    if (mode !== 'live' && mode !== 'sim') return void res.status(400).json({ error: 'mode must be live|sim' });
    const targets = lane === 'all' ? LANES : LANES.includes(lane as Lane) ? [lane as Lane] : null;
    if (!targets) return void res.status(400).json({ error: `lane must be one of ${LANES.join('|')}|all` });
    for (const l of targets) setMode(l, mode);
    emit(null, 'note', { text: `Mode: ${targets.join(', ')} → ${mode}`, modes: modes() });
    res.json({ ok: true, modes: modes(), dryRun: config.dryRun });
  });

  app.post('/demo/sim-intake', admin, async (req, res) => {
    const b = req.body ?? {};
    try {
      const callId = await simProvider.simulateInbound({
        ...(typeof b.from === 'string' && b.from ? { from: b.from } : {}),
        ...(typeof b.text === 'string' && b.text ? { text: b.text } : {}),
        ...(typeof b.symptom === 'string' && b.symptom ? { symptom: b.symptom } : {}),
      });
      res.json({ ok: true, callId });
    } catch (err) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // Physical verification (scripts/verify-live.ts): ring ONE roster phone through the guarded dialer, using a throwaway job.
  // The job stays DIAGNOSED (never SOURCING), so ending the call cannot trigger a sourcing callback to anyone else.
  app.post('/demo/test-call', admin, async (req, res) => {
    const rosterId = String(req.body?.rosterId ?? '');
    const roster = safeRoster();
    if (!roster) return void res.status(500).json({ error: 'roster not loadable' });
    const all = [roster.user, roster.warranty, ...roster.suppliers, ...(roster.tech ? [roster.tech] : [])];
    const entry = all.find((e) => e.id === rosterId);
    if (!entry) return void res.status(404).json({ error: `unknown rosterId "${rosterId}"`, known: all.map((e) => e.id) });
    const lane: Lane = entry.id === roster.user.id ? 'user' : entry.id === roster.warranty.id ? 'warranty' : entry.id === roster.tech?.id ? 'tech' : 'supplier';
    try {
      const hit = lane === 'tech' ? parts.byFault('SPN 3226 FMI 4') : parts.lookup('WED4815EW', 'runs but no heat');
      if (!hit) return void res.status(500).json({ error: 'seed part not found in catalog' });
      const job = jobs.create({
        kind: lane === 'tech' ? 'enterprise' : 'consumer',
        customer: lane === 'tech' ? { name: entry.name, phone: entry.phone } : { name: roster.user.name, phone: roster.user.phone },
        appliance: lane === 'tech' ? 'Terminal tractor YT-07' : 'Whirlpool electric dryer',
        model: lane === 'tech' ? undefined : 'WED4815EW',
        symptom: lane === 'tech' ? 'SPN 3226 FMI 4' : 'runs but no heat',
        part: hit.part,
        purchaseYear: 2019,
        consentCallback: false,
        notes: [`TEST CALL to ${entry.id} (${lane}). Throwaway job.`],
        ...(lane === 'tech' ? { fault: { asset: 'Terminal tractor YT-07', code: 'SPN 3226 FMI 4', site: 'Test yard', techName: entry.name } } : {}),
      });
      jobs.transition(job.id, 'NEW', 'DIAGNOSED');
      if (lane === 'user') {
        // Callback test: give the job a deal to read out. Approving it only records a mock order.
        jobs.update(job.id, (j) => {
          j.bestDeal = { vendorId: 'test', supplier: 'Test Supplier', price: 9.1, shipping: 3.95, landedTotal: 13.05, inStock: true, eta: 'Tuesday', identicalPart: true, callId: '', source: 'tool' };
        });
        jobs.transition(job.id, 'DIAGNOSED', 'AWAITING_CONFIRMATION');
      }
      const cur = jobs.get(job.id)!;
      const ctx = await dialer.placeGuardedCall(cur, { lane, vendorId: lane === 'supplier' || lane === 'warranty' || lane === 'tech' ? entry.id : undefined, maxSec: config.maxSec[lane] });
      if (!ctx) return void res.status(409).json({ error: 'guard refused or call failed; see /events.json', jobId: job.id });
      res.json({ ok: true, jobId: job.id, callId: ctx.callId, lane, mode: ctx.mode });
    } catch (err) {
      res.status(500).json({ error: errMsg(err) });
    }
  });
}
