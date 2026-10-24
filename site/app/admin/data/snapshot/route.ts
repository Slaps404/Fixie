import { readFile } from 'node:fs/promises';
import { isAdmin } from '../../_lib/auth';
import { API_URL, backend } from '../../_lib/backend';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SERVER_LOG = process.env.FIXIE_SERVER_LOG || '/var/log/fixie-server.log';

// The log is not masked at the source, so hide phone numbers and anything key-shaped before it leaves the box.
function scrub(line: string): string {
  return line
    .replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => `···${m.replace(/\D/g, '').slice(-4)}`)
    .replace(/\b(sk|pk|rk|whsec|AC|SK)_?[A-Za-z0-9]{16,}\b/g, '[redacted]')
    .replace(/(bearer\s+|token[=:]\s*|key[=:]\s*|secret[=:]\s*|password[=:]\s*)\S+/gi, '$1[redacted]');
}

async function json(path: string) {
  try {
    const res = await backend(path, { signal: AbortSignal.timeout(4000) });
    return res.ok ? await res.json() : { error: `HTTP ${res.status}` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function logTail(lines: number) {
  try {
    const text = await readFile(SERVER_LOG, 'utf8');
    return text.split('\n').filter(Boolean).slice(-lines).map(scrub);
  } catch (err) {
    return [`(cannot read ${SERVER_LOG}: ${(err as Error).message})`];
  }
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const [health, jobs, log] = await Promise.all([json('/health'), json('/jobs'), logTail(400)]);
  return Response.json({ at: new Date().toISOString(), apiUrl: API_URL, health, jobs, log });
}
