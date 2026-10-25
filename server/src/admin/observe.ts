// In-process observation of the event stream for the admin views (full call transcripts, recent guard rows), plus redaction.
import { maskPhone, onEvent } from '../events.ts';
import type { FixieEvent } from '../types.ts';

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

export interface TLine { ts: string; speaker: string; text: string }
export interface GuardRow { ts: string; kind: string; action: string; reason: string; lane?: string }

/** A 3-minute call is a few dozen lines; the cap only stops a runaway call from growing without bound. */
const MAX_TRANSCRIPT_LINES = 2000;
const transcripts = new Map<string, TLine[]>();
const guardsByJob = new Map<string, GuardRow[]>();

onEvent((ev: FixieEvent) => {
  if (ev.type === 'transcript') {
    const id = String(ev.data.callId ?? '');
    if (!id) return;
    const arr = transcripts.get(id) ?? [];
    arr.push({ ts: ev.ts, speaker: String(ev.data.speaker ?? ev.data.lane ?? ''), text: redact(String(ev.data.text ?? '')) });
    if (arr.length > MAX_TRANSCRIPT_LINES) arr.shift();
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

export const transcriptFor = (callId: string): TLine[] => transcripts.get(callId) ?? [];
export const guardsFor = (jobId: string): GuardRow[] => guardsByJob.get(jobId) ?? [];
export function clearObserved(): void {
  transcripts.clear();
  guardsByJob.clear();
}
