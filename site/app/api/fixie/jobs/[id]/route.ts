import { backend } from '@/lib/fixie';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const r = await backend(`/jobs/${encodeURIComponent(id)}`);
    return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return Response.json({ error: 'Fixie backend unreachable' }, { status: 502 });
  }
}
