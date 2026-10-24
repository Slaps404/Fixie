import { backend } from '@/lib/fixie';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const r = await backend('/jobs');
    return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return Response.json({ error: 'Fixie backend unreachable' }, { status: 502 });
  }
}
