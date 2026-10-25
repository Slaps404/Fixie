// Visual inspection routes. Mounted from index.ts: `await mount('./vision/routes.ts');`
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { config } from '../config.ts';
import { maskPhone } from '../events.ts';
import { recordMessage } from '../admin/messages.ts';
import { vemit as emit } from './emit.ts';
import { jobs } from '../jobs.ts';
import { lookUrl, startVisualSession } from './api.ts';
import { CONFIDENT, GOAL_ASK, openGoals } from './policy.ts';
import { ingest, sessionEvent, spokenSummary, vemit, visualStatus } from './pipeline.ts';
import { store } from './store.ts';
import { downloadMedia, validTwilioSignature, twilioConfigured } from './twilio.ts';
import type { Ask, Tier1, VisionImage, VisionSession } from './types.ts';

const PAGE_FILE = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'public', 'look', 'index.html');
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ASKS: Ask[] = ['nameplate', 'receipt', 'part'];
const PROMPTS: Record<Ask, { prompt: string; icon: string }> = {
  nameplate: { prompt: 'Point at the sticker inside the door', icon: '🏷️' },
  receipt: { prompt: 'Got a receipt? Point at it', icon: '🧾' },
  part: { prompt: 'Point at the numbers on the part', icon: '🔢' },
};

function admin(req: Request, res: Response, next: NextFunction) {
  if (req.header('x-admin') !== config.adminToken) return void res.status(401).json({ error: 'unauthorized' });
  next();
}

// Codes are 4 digits, so throttle wrong guesses per IP.
const misses = new Map<string, { n: number; since: number }>();
function tooManyMisses(req: Request): boolean {
  const k = req.ip ?? 'x';
  const m = misses.get(k);
  return !!m && Date.now() - m.since < 10 * 60_000 && m.n >= 30;
}
function miss(req: Request): void {
  const k = req.ip ?? 'x';
  const m = misses.get(k);
  if (!m || Date.now() - m.since > 10 * 60_000) misses.set(k, { n: 1, since: Date.now() });
  else m.n++;
}

/** Accepts a data URL or bare base64 (with a separate mime). */
export function decodeImage(v: unknown, mimeHint = 'image/jpeg'): { mime: string; data: Buffer } | null {
  if (typeof v !== 'string' || v.length < 32) return null;
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(v);
  const mime = m ? m[1] : mimeHint;
  if (!/^image\//.test(mime)) return null;
  const data = Buffer.from(m ? m[2] : v, 'base64');
  if (!data.length || data.length > MAX_IMAGE_BYTES) return null;
  return { mime, data };
}

function num01(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined;
}
function parseTier1(t: any): Tier1 | undefined {
  if (!t || typeof t !== 'object') return undefined;
  return { score: num01(t.score) ?? 0, sharpness: num01(t.sharpness), text: num01(t.text), glare: num01(t.glare), stable: !!t.stable, manual: !!t.manual };
}

function page(code: string | null, s: VisionSession | undefined): string {
  const cfg = code
    ? { code, valid: !!s, ...(s ? { ...PROMPTS[s.ask], ask: s.ask, maxShots: 5 } : {}) }
    : { code: null, valid: false };
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  return readFileSync(PAGE_FILE, 'utf8').replace('/*__LOOK_CONFIG__*/', `window.__LOOK__ = ${json};`);
}

function headline(s: VisionSession): string {
  const f = s.facts;
  if ((f.model?.confidence ?? 0) >= CONFIDENT) return [f.brand?.value, f.model!.value].filter(Boolean).join(' ');
  if ((f.purchaseDate?.confidence ?? 0) >= CONFIDENT) return `Bought ${f.purchaseDate!.value}`;
  if ((f.partNumber?.confidence ?? 0) >= CONFIDENT) return f.partNumber!.value;
  return '';
}

/** Result shape for the camera page and GET /vision/:code/result. No phone numbers, no image bytes. */
export function resultView(s: VisionSession) {
  const extracted = s.images.filter((i) => i.extracted).length;
  const open = openGoals(s.goals, s.facts);
  // The first goal is the primary one (the nameplate unlocks the parts lookup); later goals are nice-to-have.
  const primaryDone = s.goals.length > 0 && !open.includes(s.goals[0]);
  const triedButUnsure = open.some((g) => s.facts[g] && s.facts[g]!.confidence < CONFIDENT) || extracted > s.extractions.length;
  const nextAsk: Ask | null = open[0] ? GOAL_ASK[open[0]] : null;
  return {
    code: s.code,
    jobId: s.jobId,
    status: s.status,
    done: s.status === 'done',
    working: s.status === 'working' || !!s.running || !!s.timer,
    goals: s.goals,
    missing: open,
    headline: headline(s),
    spoken: spokenSummary(s),
    primaryDone,
    next: primaryDone && nextAsk ? PROMPTS[nextAsk] : null,
    hint: s.status === 'waiting' && triedButUnsure ? 'Closer, and hold still' : null,
    facts: Object.fromEntries(Object.entries(s.facts).map(([k, v]) => [k, typeof v === 'object' && v ? { value: v.value, confidence: v.confidence } : v])),
    images: s.images.length,
    tier2Calls: s.tier2Calls,
    tier3Calls: s.tier3Calls,
    extractions: s.extractions.map((e) => ({ imageId: e.imageId, kind: e.kind, fields: e.fields, confidence: e.confidence, by: e.by })),
    expiresAt: new Date(s.expiresAt).toISOString(),
  };
}

// ---------------------------------------------------------------- MMS

export interface MmsResult {
  matched: 'session_phone' | 'job_phone' | 'code_in_body' | 'none';
  code: string | null;
  jobId: string | null;
  accepted: string[];
  errors: string[];
}

/** Twilio Messaging webhook body → images in the right session. `download` is injectable for tests. */
export async function handleInboundMms(
  p: Record<string, string>,
  download: (url: string) => Promise<{ mime: string; data: Buffer }> = downloadMedia,
): Promise<MmsResult> {
  const from = p.From ?? '';
  const body = (p.Body ?? '').trim();
  const n = Math.min(10, Number(p.NumMedia ?? 0) || 0);
  let s = from ? store.byPhone(from) : undefined;
  let matched: MmsResult['matched'] = s ? 'session_phone' : 'none';
  if (!s && from) {
    const job = jobs.byCaller(from);
    if (job) {
      s = store.create({ jobId: job.id, phone: job.customer.phone, ask: /receipt/i.test(body) ? 'receipt' : 'nameplate', known: { model: job.model, purchaseYear: job.purchaseYear } });
      sessionEvent(s, 'mms', lookUrl(s.code));
      matched = 'job_phone';
    }
  }
  if (!s) {
    const code = /\b(\d{4})\b/.exec(body)?.[1];
    const byCode = code ? store.get(code) : undefined;
    if (byCode) {
      s = byCode;
      matched = 'code_in_body';
    }
  }
  if (!s && n > 0) {
    // Unknown sender: keep the photo in an unattached session so an operator can still see it on the board.
    s = store.create({ jobId: null, phone: from || undefined, ask: /receipt/i.test(body) ? 'receipt' : 'nameplate' });
    sessionEvent(s, 'mms_unmatched', lookUrl(s.code));
  }
  const out: MmsResult = { matched, code: s?.code ?? null, jobId: s?.jobId ?? null, accepted: [], errors: [] };
  if (!s) return out;
  for (let i = 0; i < n; i++) {
    const url = p[`MediaUrl${i}`];
    if (!url) continue;
    try {
      const media = await download(url);
      const mime = (p[`MediaContentType${i}`] || media.mime).split(';')[0];
      if (!/^image\//.test(mime)) {
        out.errors.push(`media ${i}: ${mime} is not an image`);
        continue;
      }
      const img = ingest(s, { source: 'mms', mime, data: media.data, ...(body ? { caption: body.slice(0, 200) } : {}) });
      if (img) out.accepted.push(img.id);
      else out.errors.push('session image limit reached');
    } catch (err) {
      out.errors.push(`media ${i}: ${(err as Error).message}`);
    }
  }
  emit(s.jobId, 'note', { text: `MMS from ${maskPhone(from)}: ${out.accepted.length} photo(s) → vision session ${s.code} (${matched})`, errors: out.errors });
  return out;
}

const twiml = (msg?: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ''}</Response>`;

// ---------------------------------------------------------------- routes

/** Operator log of what customers text us. Twilio sends WhatsApp replies through the same webhook with a `whatsapp:` prefix. */
function recordInboundText(p: Record<string, string>): void {
  const body = (p.Body ?? '').trim();
  const from = p.From ?? '';
  if (!body || !from) return;
  const phone = from.replace(/^whatsapp:/, '');
  recordMessage({
    direction: 'in',
    channel: from.startsWith('whatsapp:') ? 'whatsapp' : 'sms',
    phone,
    body,
    status: 'received',
    reason: null,
    source: 'inbound',
    jobId: jobs.byCaller(phone)?.id ?? null,
  });
}

export function register(app: Express): void {
  // Admin: create a session (what the request_visual tool does via startVisualSession()).
  app.post('/vision/session', admin, async (req, res) => {
    const b = req.body ?? {};
    const ask = ASKS.includes(b.ask) ? (b.ask as Ask) : 'nameplate';
    try {
      const r = await startVisualSession({ jobId: typeof b.jobId === 'string' && b.jobId ? b.jobId : null, ask, sendSms: b.sendSms !== false, via: 'admin' });
      res.json({ ok: true, ...r });
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
    }
  });

  // Admin: what check_visual would return for a job.
  app.get('/vision/job/:jobId', admin, (req, res) => {
    res.json(visualStatus(String(req.params.jobId)));
  });

  // Camera page. /look (no code) is the keypad for the spoken-code fallback.
  const sendPage = (res: Response, html: string, status = 200) => {
    res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Permissions-Policy': 'camera=(self)', 'Referrer-Policy': 'no-referrer' }).send(html);
  };
  app.get('/look', (_req, res) => sendPage(res, page(null, undefined)));
  app.get('/look/:code', (req, res) => {
    if (tooManyMisses(req)) return void res.status(429).send('Too many tries. Keep talking to Fixie.');
    const code = String(req.params.code).replace(/\D/g, '').slice(0, 4);
    const s = store.get(code);
    if (!s) miss(req);
    sendPage(res, page(code, s), s ? 200 : 404);
  });

  // Page telemetry: camera started (or failed).
  app.post('/vision/:code/opened', (req, res) => {
    const s = store.get(String(req.params.code));
    if (!s) return void res.status(404).json({ error: 'expired' });
    const first = !s.opened;
    s.opened = s.opened || req.body?.camera === true;
    if (first || req.body?.camera === false) {
      vemit(s, 'vision_session', { code: s.code, phase: 'opened', camera: req.body?.camera === true, error: typeof req.body?.error === 'string' ? req.body.error.slice(0, 60) : null, res: req.body?.w ? `${req.body.w}x${req.body.h}` : null, takePhoto: !!req.body?.takePhoto });
    }
    res.json({ ok: true });
  });

  // Upload stills: JSON {frames:[{image, crop?, thumb?, tier1?}]} (or a single frame object),
  // or a raw image/* body with ?score=0.7. JSON bodies go through index.ts's 5 MB express.json.
  app.post('/vision/:code/frames', express.raw({ type: 'image/*', limit: '8mb' }), (req, res) => {
    if (tooManyMisses(req)) return void res.status(429).json({ error: 'too many tries' });
    const s = store.get(String(req.params.code));
    if (!s) {
      miss(req);
      return void res.status(404).json({ error: 'expired' });
    }
    const accepted: string[] = [];
    const rejected: string[] = [];
    const add = (img: Omit<VisionImage, 'id' | 'receivedAt'>) => {
      const r = ingest(s, img);
      if (r) accepted.push(r.id);
      else rejected.push('session image limit reached');
    };
    if (Buffer.isBuffer(req.body)) {
      const mime = String(req.header('content-type') ?? 'image/jpeg').split(';')[0];
      if (!req.body.length || req.body.length > MAX_IMAGE_BYTES) rejected.push('bad image size');
      else add({ source: 'upload', mime, data: req.body, tier1: req.query.score !== undefined ? { score: num01(req.query.score) ?? 0 } : undefined, ...(req.query.caption ? { caption: String(req.query.caption).slice(0, 200) } : {}) });
    } else {
      const b = req.body ?? {};
      const frames: any[] = Array.isArray(b.frames) ? b.frames : b.image ? [b] : [];
      for (const f of frames.slice(0, 6)) {
        const main = decodeImage(f?.image, f?.mime);
        if (!main) {
          rejected.push('bad image');
          continue;
        }
        const crop = decodeImage(f.crop);
        const thumb = decodeImage(f.thumb);
        add({
          source: f.source === 'upload' ? 'upload' : 'camera',
          mime: main.mime,
          data: main.data,
          ...(crop ? { crop } : {}),
          ...(thumb ? { thumb } : {}),
          ...(parseTier1(f.tier1) ? { tier1: parseTier1(f.tier1) } : {}),
          ...(typeof f.caption === 'string' ? { caption: f.caption.slice(0, 200) } : {}),
        });
      }
    }
    res.status(accepted.length ? 200 : 400).json({ ok: accepted.length > 0, accepted, rejected, status: s.status });
  });

  app.get('/vision/:code/result', (req, res) => {
    if (tooManyMisses(req)) return void res.status(429).json({ error: 'too many tries' });
    const s = store.get(String(req.params.code));
    if (!s) {
      miss(req);
      return void res.status(404).json({ expired: true });
    }
    res.set('Cache-Control', 'no-store').json(resultView(s));
  });

  // Twilio Messaging webhook (inbound SMS/MMS). Configure on the number: A MESSAGE COMES IN → POST {PUBLIC_URL}/sms/inbound
  app.post('/sms/inbound', express.urlencoded({ extended: false, limit: '64kb' }), async (req, res) => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.body ?? {})) params[k] = String(v);
    const mustVerify = twilioConfigured() && !config.dryRun && process.env.VISION_SKIP_TWILIO_SIG !== '1';
    if (mustVerify) {
      const url = (config.publicUrl || `${req.protocol}://${req.get('host')}`) + req.originalUrl;
      if (!validTwilioSignature(req.header('x-twilio-signature'), url, params)) {
        emit(null, 'error', { where: 'sms.inbound', detail: 'Twilio signature check failed (is the webhook URL exactly PUBLIC_URL/sms/inbound?)' });
        return void res.status(403).type('text/xml').send(twiml());
      }
    }
    recordInboundText(params);
    const r = await handleInboundMms(params);
    // Replies are outbound SMS too (best effort; may be filtered on an unregistered number).
    res.type('text/xml').send(twiml(r.accepted.length ? 'Got your photo. Fixie is looking now.' : undefined));
  });
}
