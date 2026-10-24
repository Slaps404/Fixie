import { backend } from '@/lib/fixie';

export const dynamic = 'force-dynamic';

// The admin token is attached here, on the server. The browser never sees it.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const r = await backend(`/jobs/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
      admin: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Stopped from the Fixie dashboard. Ended the job and its live calls.' }),
    });
    return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return Response.json({ error: 'Fixie backend unreachable' }, { status: 502 });
  }
}
