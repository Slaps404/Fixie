// Tier 2 → tier 3 pipeline with early stop. One run per session at a time; uploads during a run queue a rerun.
import { maskPhone } from '../events.ts';
import { vemit as sinkEmit } from './emit.ts';
import { config } from '../config.ts';
import { calls } from '../calls.ts';
import { jobs } from '../jobs.ts';
import { CONFIDENT, currentAsk, KIND_GOALS, nextStep, openGoals, rankImages, rankReason } from './policy.ts';
import { stubClassify, TIER2_MODEL, TIER3_MODEL, visionModel } from './llm.ts';
import { store } from './store.ts';
import type { Ask, Extraction, Facts, ImageKind, VisionImage, VisionSession } from './types.ts';
import { mergeFacts, validate } from './validate.ts';

type VisionEventType = 'vision_session' | 'vision_capture' | 'vision_rank' | 'vision_extract' | 'vision_done';
export function vemit(s: Pick<VisionSession, 'jobId'>, type: VisionEventType, data: Record<string, unknown>, simulated = false): void {
  sinkEmit(s.jobId, type, data, simulated);
}

const DEBOUNCE_MS = Number(process.env.VISION_DEBOUNCE_MS ?? 700);

export interface VisionUpdate {
  jobId: string | null;
  code: string;
  facts: Facts;
  extraction?: Extraction;
  done: boolean;
  doneReason?: string;
  spoken: string;
}
type Listener = (u: VisionUpdate) => void;
const listeners = new Set<Listener>();
/** Lane A hook: called after every tier-3 extraction and when a run stops. Returns an unsubscribe fn. */
export function onVisionUpdate(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify(s: VisionSession, extraction?: Extraction): void {
  const u: VisionUpdate = { jobId: s.jobId, code: s.code, facts: s.facts, ...(extraction ? { extraction } : {}), done: s.status === 'done', ...(s.doneReason ? { doneReason: s.doneReason } : {}), spoken: spokenSummary(s) };
  for (const cb of listeners) {
    try {
      cb(u);
    } catch (err) {
      console.error('[vision] listener failed:', (err as Error).message);
    }
  }
}

let nextImg = 1;
export function newImageId(): string {
  return `img_${nextImg++}`;
}

/** Add a still to the session, emit vision_capture, and schedule a pipeline run. */
export function ingest(s: VisionSession, img: Omit<VisionImage, 'id' | 'receivedAt'>): VisionImage | null {
  const full: VisionImage = { ...img, id: newImageId(), receivedAt: Date.now() };
  if (!store.addImage(s, full)) return null;
  if (s.status === 'waiting') s.status = 'capturing';
  vemit(s, 'vision_capture', {
    code: s.code,
    imageId: full.id,
    source: full.source,
    tier1Score: full.tier1 ? round(full.tier1.score) : null,
    ...(full.tier1 ? { tier1: { sharpness: r2(full.tier1.sharpness), text: r2(full.tier1.text), glare: r2(full.tier1.glare), manual: !!full.tier1.manual } } : {}),
    kb: Math.round(full.data.length / 1024),
    hasCrop: !!full.crop,
  });
  schedule(s);
  return full;
}

export function schedule(s: VisionSession, delay = DEBOUNCE_MS): void {
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    s.timer = undefined;
    void run(s);
  }, delay);
  s.timer.unref?.();
}

const failsByKind = new WeakMap<VisionSession, Partial<Record<ImageKind, number>>>();

/** Run tier 2 then tier 3 until the early-stop policy says stop. Safe to call repeatedly. */
export async function run(s: VisionSession): Promise<void> {
  if (s.running) {
    s.rerun = true;
    return;
  }
  s.running = true;
  try {
    do {
      s.rerun = false;
      await runOnce(s);
    } while (s.rerun && store.get(s.code));
  } finally {
    s.running = false;
  }
}

async function runOnce(s: VisionSession): Promise<void> {
  const model = visionModel();
  const sim = model.name === 'stub';
  if (!openGoals(s.goals, s.facts).length && s.status === 'done') return;
  s.status = 'working';

  // ---- Tier 2: classify new images. Skip the model when there is nothing to choose between (fast path).
  const fresh = s.images.filter((i) => !i.kind);
  let by: 'claude' | 'stub' | 'fast_path' = model.name;
  // Heuristic prior = what the page is currently asking for (it switches to the receipt once the model is known).
  const ask = currentAsk(s.goals, s.facts, s.ask);
  if (fresh.length) {
    const pendingTotal = s.images.filter((i) => !i.extracted).length;
    // Fast path only for the very first image, where latency matters most: tier 3 reads the kind itself.
    // After that the cheap classifier always gates, so repeat shots of a solved item never reach tier 3.
    if (pendingTotal <= 1 && s.extractions.length === 0 && s.tier3Calls === 0) {
      by = 'fast_path';
      for (const img of fresh) Object.assign(img, stubClassify(img, ask), { rankedBy: 'fast_path' });
    } else {
      try {
        s.tier2Calls++;
        const cls = await model.classify(fresh, ask);
        fresh.forEach((img, i) => Object.assign(img, cls[i], { rankedBy: model.name }));
      } catch (err) {
        by = 'stub';
        console.warn('[vision] tier-2 classify failed, using heuristics:', (err as Error).message);
        for (const img of fresh) Object.assign(img, stubClassify(img, ask), { rankedBy: 'stub' });
      }
    }
    const order = rankImages(s.images.filter((i) => !i.extracted), s.goals, s.facts);
    vemit(s, 'vision_rank', {
      code: s.code,
      order,
      reason: (by === 'fast_path' ? 'Single image: skipped the tier-2 classifier (fast path). ' : '') + rankReason(order, s.goals, s.facts),
      by,
      model: by === 'claude' ? TIER2_MODEL : null,
    }, sim);
  }

  // ---- Tier 3: extract in priority order until confident (early stop), out of budget, or nothing useful left.
  const fails = failsByKind.get(s) ?? {};
  failsByKind.set(s, fails);
  let extractedThisRun = 0;
  for (;;) {
    if (!store.get(s.code)) return; // reset or expired mid-run
    const ranked = rankImages(s.images, s.goals, s.facts);
    const step = nextStep(ranked, s.images, s.goals, s.facts, s.tier3Calls, fails);
    if (step.action === 'stop') {
      s.status = step.code === 'goals_met' ? 'done' : 'waiting';
      s.doneReason = step.reason;
      if (extractedThisRun || fresh.length) {
        vemit(s, 'vision_done', { code: s.code, stop: step.code, reason: step.reason, tier2Calls: s.tier2Calls, tier3Calls: s.tier3Calls, images: s.images.length, facts: factSummary(s.facts) }, sim);
        notify(s);
        if (step.code === 'goals_met') void pushToLiveCall(s);
      }
      return;
    }
    const img = s.images.find((i) => i.id === step.imageId)!;
    img.extracted = true;
    s.tier3Calls++;
    extractedThisRun++;
    let ex: Extraction | null = null;
    try {
      const job = s.jobId ? jobs.get(s.jobId) : undefined;
      const raw = await model.extract(img, { appliance: job?.appliance });
      if (raw) ex = validate({ ...raw, kind: raw.kind ?? img.kind ?? 'other' }, img.id, model.name, { symptom: job?.symptom, part: job?.part }, model.name === 'claude' ? TIER3_MODEL : undefined);
    } catch (err) {
      sinkEmit(s.jobId, 'error', { where: 'vision.extract', detail: (err as Error).message.slice(0, 200), imageId: img.id });
    }
    if (!store.get(s.code)) return;
    if (!ex) {
      fails[img.kind ?? 'other'] = (fails[img.kind ?? 'other'] ?? 0) + 1;
      continue;
    }
    if (ex.kind !== img.kind) img.kind = ex.kind; // tier 3 saw it at full resolution; trust its kind
    s.extractions.push(ex);
    mergeFacts(s.facts, ex);
    const confidentGoal = KIND_GOALS[ex.kind].some((g) => (ex!.goalConfidence[g] ?? 0) >= CONFIDENT);
    if (!confidentGoal) fails[ex.kind] = (fails[ex.kind] ?? 0) + 1;
    vemit(s, 'vision_extract', {
      code: s.code,
      imageId: ex.imageId,
      kind: ex.kind,
      fields: ex.fields,
      confidence: ex.confidence,
      goalConfidence: ex.goalConfidence,
      checks: ex.checks,
      by: ex.by,
      model: ex.model ?? null,
    }, sim);
    notify(s, ex);
  }
}

// ---------------------------------------------------------------- what the voice agent hears

function factSummary(f: Facts): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) out[k] = typeof v === 'object' && v ? { value: v.value, confidence: v.confidence } : v;
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** One spoken sentence for the voice agent's check_visual tool. Deterministic; the LLM only reads it out. */
export function spokenSummary(s: VisionSession): string {
  const f = s.facts;
  const sure = (k: 'model' | 'purchaseDate' | 'partNumber') => (f[k]?.confidence ?? 0) >= CONFIDENT;
  const bits: string[] = [];
  if (sure('model')) bits.push(`I can see it: ${f.brand ? `${f.brand.value} ` : ''}model ${f.model!.value}`);
  if (sure('purchaseDate')) {
    const [y, m] = f.purchaseDate!.value.split('-');
    bits.push(`the receipt says ${MONTHS[Number(m) - 1]} ${y}${f.store ? ` at ${f.store.value}` : ''}`);
  }
  if (sure('partNumber')) bits.push(`the label reads part ${f.partNumber!.value}`);
  if (bits.length) {
    const missing = openGoals(s.goals, f);
    return bits.join(', and ') + '.' + (missing.length ? ` Still looking for the ${missing.map((g) => (g === 'model' ? 'model sticker' : g === 'purchaseDate' ? 'receipt' : 'part label')).join(' and ')}, but we can carry on without it.` : '');
  }
  if (s.status === 'working' || (s.running && s.images.length)) return 'Got a picture, reading it now. One moment.';
  if (s.images.length) {
    if (f.model && !sure('model')) return `It might say ${f.model.value}, but I'm not sure. Tilt the phone a little so there's no shine, and hold it still.`;
    return "The picture's a bit blurry. Hold the phone a hand's width from the sticker, tilt it so there's no shine, and keep still.";
  }
  if (s.opened) return `Your camera's on. ${ASK_LINE[s.ask]}`;
  return `The link isn't open yet. It's in your texts from Fixie, or anyone can open the Fixie look page and type ${s.code.split('').join(' ')}.`;
}
const ASK_LINE: Record<Ask, string> = {
  nameplate: 'Point it at the sticker inside the dryer door and hold still.',
  receipt: 'Lay the receipt flat in good light and point the camera at it.',
  part: 'Point it at the printed numbers on the part.',
};

export function visualStatus(jobId: string): { found: boolean; code?: string; status?: VisionSession['status']; spoken: string; facts?: Record<string, unknown> } {
  const s = store.byJob(jobId);
  if (!s) return { found: false, spoken: "I haven't sent a camera link for this call yet." };
  return { found: true, code: s.code, status: s.status, spoken: spokenSummary(s), facts: factSummary(s.facts) };
}

// ---------------------------------------------------------------- optional push into the live call (UNVERIFIED)

/**
 * Off by default (VISION_PUSH=1 to enable). Injects the result into the live user-lane call through Vapi's
 * monitor controlUrl ("add-message"), so the agent can speak without waiting for check_visual.
 * Unverified against Vapi tonight; inbound intake calls only have a controlUrl if the assistant sets monitorPlan.controlEnabled.
 */
export async function pushToLiveCall(s: VisionSession): Promise<boolean> {
  if (process.env.VISION_PUSH !== '1' || !s.jobId || config.dryRun) return false;
  const call = calls.forJob(s.jobId).find((c) => c.lane === 'user' && c.state === 'live' && c.controlUrl);
  if (!call?.controlUrl) return false;
  try {
    const res = await fetch(call.controlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'add-message',
        message: { role: 'system', content: `Visual inspection result (from the caller's camera): ${spokenSummary(s)} Tell the caller now, then continue.` },
        triggerResponseEnabled: true,
      }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function sessionEvent(s: VisionSession, via: string, url: string): void {
  vemit(s, 'vision_session', { code: s.code, url, via, ask: s.ask, goals: s.goals, phone: maskPhone(s.phone), expiresAt: new Date(s.expiresAt).toISOString() });
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number | undefined) => (typeof n === 'number' ? Math.round(n * 100) / 100 : null);
