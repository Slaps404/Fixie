// Session store for visual inspection. In memory only: images never touch disk.
// A session dies after TTL (1 h) or when /demo/reset bumps the demo epoch, whichever comes first.
import { randomInt } from 'node:crypto';
import { getEpoch } from '../config.ts';
import type { Ask, Goal, VisionImage, VisionSession } from './types.ts';

export const SESSION_TTL_MS = Number(process.env.VISION_TTL_MS) || 60 * 60 * 1000;
export const MAX_IMAGES_PER_SESSION = Number(process.env.VISION_MAX_IMAGES) || 16;

const sessions = new Map<string, VisionSession>();
const digits = (p: string | undefined) => (p ?? '').replace(/\D/g, '');
const phoneKey = (p: string | undefined) => digits(p).slice(-10);

export function defaultGoals(ask: Ask, known: { model?: string; purchaseYear?: number } = {}): Goal[] {
  if (ask === 'receipt') return ['purchaseDate'];
  if (ask === 'part') return ['partNumber'];
  // A nameplate photo verifies the model even when the caller already said it (voice transcription is the weak link).
  const goals: Goal[] = ['model'];
  if (!known.purchaseYear) goals.push('purchaseDate');
  return goals;
}

function newCode(now: () => number): string {
  // 4 digits so it can be read aloud and typed on a keypad. Retry on collision with a live session.
  for (let i = 0; i < 50; i++) {
    const code = String(randomInt(1000, 10000));
    const s = sessions.get(code);
    if (!s || !alive(s, now())) return code;
  }
  throw new Error('no free vision code');
}

function alive(s: VisionSession, t: number): boolean {
  return s.epoch === getEpoch() && t < s.expiresAt;
}

function drop(s: VisionSession): void {
  if (s.timer) clearTimeout(s.timer);
  // Release image buffers eagerly.
  s.images.length = 0;
  sessions.delete(s.code);
}

export function createStore(now: () => number = Date.now) {
  return {
    create(init: { jobId: string | null; phone?: string; ask?: Ask; goals?: Goal[]; known?: { model?: string; purchaseYear?: number } }): VisionSession {
      this.purge();
      const ask = init.ask ?? 'nameplate';
      const t = now();
      const s: VisionSession = {
        code: newCode(now),
        jobId: init.jobId,
        ...(init.phone ? { phone: init.phone } : {}),
        ask,
        goals: init.goals?.length ? init.goals : defaultGoals(ask, init.known),
        epoch: getEpoch(),
        createdAt: t,
        expiresAt: t + SESSION_TTL_MS,
        images: [],
        extractions: [],
        facts: {},
        tier2Calls: 0,
        tier3Calls: 0,
        status: 'waiting',
        opened: false,
      };
      sessions.set(s.code, s);
      return s;
    },

    get(code: string): VisionSession | undefined {
      const s = sessions.get(String(code));
      if (!s) return undefined;
      if (!alive(s, now())) {
        drop(s);
        return undefined;
      }
      return s;
    },

    /** Latest live session for a job. */
    byJob(jobId: string): VisionSession | undefined {
      this.purge();
      let best: VisionSession | undefined;
      for (const s of sessions.values()) if (s.jobId === jobId && (!best || s.createdAt >= best.createdAt)) best = s;
      return best;
    },

    /** Latest live session whose caller number matches (last 10 digits). */
    byPhone(phone: string): VisionSession | undefined {
      this.purge();
      const key = phoneKey(phone);
      if (!key) return undefined;
      let best: VisionSession | undefined;
      for (const s of sessions.values()) if (phoneKey(s.phone) === key && (!best || s.createdAt >= best.createdAt)) best = s;
      return best;
    },

    addImage(s: VisionSession, img: VisionImage): boolean {
      if (s.images.length >= MAX_IMAGES_PER_SESSION) return false;
      s.images.push(img);
      return true;
    },

    /** Drop expired sessions and sessions from an older demo epoch. Returns how many were dropped. */
    purge(): number {
      const t = now();
      let n = 0;
      for (const s of [...sessions.values()]) {
        if (!alive(s, t)) {
          drop(s);
          n++;
        }
      }
      return n;
    },

    all(): VisionSession[] {
      this.purge();
      return [...sessions.values()];
    },

    reset(): void {
      for (const s of [...sessions.values()]) drop(s);
    },
  };
}

export type VisionStore = ReturnType<typeof createStore>;
export const store = createStore();

// Background sweep so images are deleted even if nobody touches the store again.
setInterval(() => store.purge(), 60_000).unref();
