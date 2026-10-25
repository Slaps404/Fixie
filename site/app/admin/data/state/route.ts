import { isAdmin } from '../../_lib/auth';
import { backend } from '../../_lib/backend';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const reveal = new URL(req.url).searchParams.get('reveal') === '1' ? 1 : 0;
  try {
    const res = await backend(`/admin/api/state?reveal=${reveal}`, { admin: true, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return Response.json({ error: `backend HTTP ${res.status}` }, { status: 502 });
    return Response.json(await res.json());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
