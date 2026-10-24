import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { DATA_DIR } from './config.ts';
import type { FixieEvent, FixieEventType } from './types.ts';

const LOG_FILE = join(DATA_DIR, 'events.jsonl');
mkdirSync(DATA_DIR, { recursive: true });

let nextId = 1;
const history: FixieEvent[] = [];
const clients = new Set<Response>();

/** Mask a phone number to its last 4 digits. Events must never carry full numbers. */
export function maskPhone(phone: string | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `···${digits.slice(-4)}` : '···';
}

export function emit(
  jobId: string | null,
  type: FixieEventType,
  data: Record<string, unknown> = {},
  opts: { simulated?: boolean } = {},
): FixieEvent {
  const ev: FixieEvent = { id: nextId++, ts: new Date().toISOString(), jobId, type, data };
  if (opts.simulated) ev.simulated = true;
  history.push(ev);
  try {
    appendFileSync(LOG_FILE, JSON.stringify(ev) + '\n');
  } catch {
    // Logging must never break the demo.
  }
  const frame = `id: ${ev.id}\nevent: fixie\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) res.write(frame);
  if (type !== 'transcript') console.log(`[event] ${type}`, jobId ?? '', JSON.stringify(data));
  return ev;
}

export function resetEvents(): void {
  history.length = 0;
  for (const res of clients) res.write(`event: reset\ndata: {}\n\n`);
}

/** GET /events: Server-Sent Events. Replays history (or everything after Last-Event-ID), then streams. */
export function sseHandler(req: Request, res: Response): void {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  const lastId = Number(req.header('Last-Event-ID') ?? 0);
  for (const ev of history) {
    if (ev.id > lastId) res.write(`id: ${ev.id}\nevent: fixie\ndata: ${JSON.stringify(ev)}\n\n`);
  }
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

/** GET /events.json?since=<id>: polling fallback. */
export function eventsJsonHandler(req: Request, res: Response): void {
  const since = Number(req.query.since ?? 0);
  res.json(history.filter((e) => e.id > since));
}
