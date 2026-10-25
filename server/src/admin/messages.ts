// Operator-visible text log: admin sends, agent texts (from note events), inbound replies. JSON file, tmp + rename, newest 500.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DATA_DIR } from '../config.ts';
import { onEvent } from '../events.ts';
import { jobs } from '../jobs.ts';

export type MessageChannel = 'whatsapp' | 'sms';
export type MessageStatus = 'sent' | 'failed' | 'dry_run' | 'received';

/** Holds the full phone. Masking happens when a view is built. */
export interface StoredMessage {
  id: string;
  at: number;
  direction: 'out' | 'in';
  channel: MessageChannel;
  phone: string;
  body: string;
  status: MessageStatus;
  reason: string | null;
  source: 'admin' | 'agent' | 'inbound';
  jobId: string | null;
}

const KEEP = 500;
/** MESSAGES_FILE env override exists so tests/tools can point the store elsewhere. */
const file = () => process.env.MESSAGES_FILE || join(DATA_DIR, 'messages.json');

/** Oldest first. A missing or corrupt file reads as empty. */
export function listMessages(): StoredMessage[] {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as { messages?: StoredMessage[] };
    return Array.isArray(raw?.messages) ? raw.messages : [];
  } catch {
    return [];
  }
}

export function recordMessage(m: Omit<StoredMessage, 'id' | 'at'> & { at?: number }): StoredMessage {
  const msg: StoredMessage = { ...m, id: `msg_${randomUUID().slice(0, 8)}`, at: m.at ?? Date.now() };
  const path = file();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ messages: [...listMessages(), msg].slice(-KEEP) }, null, 2));
    renameSync(tmp, path);
  } catch (err) {
    console.error('[admin] message log write failed:', (err as Error).message);
  }
  return msg;
}

const AGENT_STATUS: Record<string, MessageStatus> = { whatsapp_sent: 'sent', whatsapp_failed: 'failed', text_sent: 'dry_run' };

// Agent texts go to the job's customer. whatsapp_failed events carry no body, only the failure detail.
onEvent((ev) => {
  if (ev.type !== 'note' || !ev.jobId) return;
  const status = AGENT_STATUS[String(ev.data.kind)];
  const phone = jobs.get(ev.jobId)?.customer.phone;
  if (!status || !phone) return;
  const detail = [ev.data.detail, ev.data.code != null ? `code ${String(ev.data.code)}` : ''].filter(Boolean).join(' ');
  recordMessage({
    at: Date.parse(ev.ts),
    direction: 'out',
    channel: 'whatsapp',
    phone,
    body: typeof ev.data.text === 'string' ? ev.data.text : '(message body not recorded)',
    status,
    reason: status === 'failed' ? detail || null : status === 'dry_run' ? 'Dry run: not sent' : null,
    source: 'agent',
    jobId: ev.jobId,
  });
});
