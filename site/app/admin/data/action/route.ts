import { endAdminSession, isAdmin } from '../../_lib/auth';
import { backend } from '../../_lib/backend';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = { action?: string; jobId?: string; lane?: string; mode?: string; text?: string };

// Only these backend admin endpoints are reachable from the console.
function route(b: Body): { path: string; body: Record<string, unknown> } | null {
  switch (b.action) {
    case 'stop':
      return b.jobId ? { path: `/jobs/${encodeURIComponent(b.jobId)}/stop`, body: { reason: 'Stopped from the admin console.' } } : null;
    case 'delivered':
      return { path: '/simulate/delivered', body: b.jobId ? { jobId: b.jobId } : {} };
    case 'reset':
      return { path: '/demo/reset', body: {} };
    case 'mode':
      return { path: '/demo/mode', body: { lane: b.lane, mode: b.mode } };
    case 'sim-intake':
      return { path: '/demo/sim-intake', body: b.text ? { text: b.text } : {} };
    default:
      return null;
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  if (b.action === 'logout') {
    await endAdminSession();
    return Response.json({ ok: true });
  }
  const target = route(b);
  if (!target) return Response.json({ error: `unknown action "${b.action}"` }, { status: 400 });
  try {
    const res = await backend(target.path, {
      method: 'POST',
      admin: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(target.body),
    });
    const out = await res.json().catch(() => ({}));
    return Response.json(out, { status: res.status });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
