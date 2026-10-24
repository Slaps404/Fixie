// Public surface of the vision module for Lane A (orchestrator / webhook). Import from './vision/api.ts'.
import { config } from '../config.ts';
import { jobs } from '../jobs.ts';
import { ingest, onVisionUpdate, sessionEvent, spokenSummary, visualStatus } from './pipeline.ts';
import { store } from './store.ts';
import { sendSms } from './twilio.ts';
import type { Ask, Goal, VisionImage, VisionSession } from './types.ts';

export { onVisionUpdate, visualStatus, spokenSummary };
export type { VisionUpdate } from './pipeline.ts';

export function lookUrl(code?: string): string {
  const base = config.publicUrl || `http://localhost:${config.port}`;
  return code ? `${base}/look/${code}` : `${base}/look`;
}
/** Host to read aloud, e.g. "fixie-demo.trycloudflare.com". */
export const spokenHost = () => lookUrl().replace(/^https?:\/\//, '');

export interface StartResult {
  code: string;
  url: string;
  shortUrl: string;
  /** What the voice agent says right after asking "Can I take a look?". */
  spoken: string;
  sms: { sent: boolean; reason: string };
  reused: boolean;
}

/**
 * Create (or reuse) a camera session for a job and best-effort text the link to the job's OWN caller number.
 * There is deliberately no `to` argument: like the dialer, we only ever message the number that called in.
 */
export async function startVisualSession(opts: { jobId: string | null; ask?: Ask; goals?: Goal[]; sendSms?: boolean; via?: string }): Promise<StartResult> {
  const job = opts.jobId ? jobs.get(opts.jobId) : undefined;
  if (opts.jobId && !job) throw new Error(`unknown job ${opts.jobId}`);
  const ask = opts.ask ?? 'nameplate';
  let s: VisionSession | undefined = opts.jobId ? store.byJob(opts.jobId) : undefined;
  const reused = !!s && s.ask === ask && s.status !== 'done';
  if (!reused) {
    s = store.create({ jobId: opts.jobId, phone: job?.customer.phone, ask, goals: opts.goals, known: { model: job?.model, purchaseYear: job?.purchaseYear } });
  }
  const url = lookUrl(s!.code);
  let sms = { sent: false, reason: 'not requested' };
  if (opts.sendSms !== false && s!.phone) {
    sms = await sendSms(s!.phone, `Fixie: tap to show me (your camera opens, keep talking to me): ${url}`);
  } else if (!s!.phone) sms = { sent: false, reason: 'no caller number on the job' };
  if (!reused) sessionEvent(s!, opts.via ?? 'request_visual', url);
  const digits = s!.code.split('').join(' ');
  const spoken = `I'm texting you a link now. Tap it and your camera opens, and we keep talking. If no text comes, anyone can open ${spokenHost()} and type ${digits}.`;
  return { code: s!.code, url, shortUrl: lookUrl(), spoken, sms, reused };
}

/** Add an image to a session from server-side code (e.g. tests, or another channel). */
export function addImage(code: string, img: Omit<VisionImage, 'id' | 'receivedAt'>): VisionImage | null {
  const s = store.get(code);
  return s ? ingest(s, img) : null;
}

/** Drop every session and its images. Call from orchestrator.resetAll(); sessions also self-purge when the epoch bumps. */
export function resetVision(): void {
  store.reset();
}
