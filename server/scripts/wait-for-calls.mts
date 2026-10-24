// Blocks until Vapi reports no active calls (queued/ringing/in-progress), or until the timeout.
// Used as ExecStop for the fixie systemd service, so `systemctl restart fixie` never cuts a live call.
// Asks Vapi directly, so it works even when our server or tunnel is down.
import 'dotenv/config';

const KEY = process.env.VAPI_API_KEY ?? '';
const TIMEOUT_S = Number(process.env.WAIT_FOR_CALLS_TIMEOUT ?? 300);
const ACTIVE = new Set(['queued', 'ringing', 'in-progress', 'forwarding']);

async function activeCalls(): Promise<number> {
  const since = new Date(Date.now() - 20 * 60_000).toISOString();
  const res = await fetch(`https://api.vapi.ai/call?limit=50&createdAtGt=${encodeURIComponent(since)}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`Vapi ${res.status}`);
  const body = (await res.json()) as unknown;
  const list = (Array.isArray(body) ? body : ((body as { results?: unknown[] }).results ?? [])) as Array<{ status?: string }>;
  return list.filter((c) => ACTIVE.has(String(c.status))).length;
}

if (!KEY) {
  console.log('[wait-for-calls] no VAPI_API_KEY; not waiting');
  process.exit(0);
}
const deadline = Date.now() + TIMEOUT_S * 1000;
for (;;) {
  let n: number;
  try {
    n = await activeCalls();
  } catch (err) {
    console.log(`[wait-for-calls] check failed (${(err as Error).message}); not blocking`);
    process.exit(0);
  }
  if (n === 0) {
    console.log('[wait-for-calls] no active calls; OK to stop');
    process.exit(0);
  }
  if (Date.now() > deadline) {
    console.log(`[wait-for-calls] ${n} call(s) still active after ${TIMEOUT_S}s; stopping anyway`);
    process.exit(0);
  }
  console.log(`[wait-for-calls] ${n} active call(s); waiting before stop/restart…`);
  await new Promise((r) => setTimeout(r, 5000));
}
