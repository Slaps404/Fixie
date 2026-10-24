import { isAdmin } from '../../_lib/auth';
import { backend } from '../../_lib/backend';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Polled instead of streamed: Cloudflare quick tunnels buffer SSE, so the stream never reaches the browser.
// GET ?since=N returns events after N. If event N is gone, the server was reset and the full history is returned.
export async function GET(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const since = Math.max(0, Number(new URL(req.url).searchParams.get('since')) || 0);
  try {
    const res = await backend(`/events.json?since=${Math.max(0, since - 1)}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return Response.json({ error: `backend HTTP ${res.status}` }, { status: 502 });
    const evs = (await res.json()) as { id: number }[];
    if (since > 0 && evs[0]?.id !== since) {
      const all = await backend('/events.json?since=0', { signal: AbortSignal.timeout(4000) }).then((r) => r.json());
      return Response.json({ reset: true, events: all });
    }
    return Response.json({ reset: false, events: since > 0 ? evs.slice(1) : evs });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
