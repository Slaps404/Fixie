import { endAdminSession, isAdmin } from '../../_lib/auth';
import { backend } from '../../_lib/backend';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = { action?: string; jobId?: string; lane?: string; mode?: string; text?: string; to?: unknown; channel?: unknown; body?: unknown; callId?: unknown };

const nonEmpty = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

// Only these backend admin endpoints are reachable from the console.
function route(b: Body): { path: string; body: Record<string, unknown> } | { error: string } | null {
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
    case 'text': {
      const body = typeof b.body === 'string' ? b.body.trim() : '';
      if (!nonEmpty(b.to, 120)) return { error: 'text: "to" must be a directory key' };
      if (b.channel !== 'whatsapp' && b.channel !== 'sms') return { error: 'text: channel must be whatsapp or sms' };
      if (body.length < 1 || body.length > 1000) return { error: 'text: body must be 1 to 1000 characters' };
      return { path: '/admin/api/messages', body: { to: b.to, channel: b.channel, body } };
    }
    case 'end-call':
      if (!nonEmpty(b.callId, 200)) return { error: 'end-call: callId required' };
      return { path: `/admin/api/calls/${encodeURIComponent(b.callId)}/end`, body: {} };
    default:
      return null;
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  if (b.action === 'logout') {
    await endAdminSession();
    return Response.json({ ok: true });
  }
  const target = route(b);
  if (!target) return Response.json({ error: `unknown action "${b.action}"` }, { status: 400 });
  if ('error' in target) return Response.json({ error: target.error }, { status: 400 });
  try {
    const res = await backend(target.path, {
      method: 'POST',
      admin: true,
      headers: { 'content-type': 'application/json', 'x-admin-ui': '1' },
      body: JSON.stringify(target.body),
    });
    const out = await res.json().catch(() => ({}));
    return Response.json(out, { status: res.status });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
