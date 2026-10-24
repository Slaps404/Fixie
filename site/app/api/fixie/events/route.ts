import { backend } from '@/lib/fixie';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Pass-through of the backend SSE stream (event names `fixie` and `reset`).
export async function GET(req: Request) {
  const headers: Record<string, string> = { accept: 'text/event-stream' };
  const last = req.headers.get('last-event-id');
  if (last) headers['last-event-id'] = last;
  try {
    const upstream = await backend('/events', { headers, signal: req.signal });
    if (!upstream.ok || !upstream.body) {
      return Response.json({ error: 'Fixie backend error' }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  } catch {
    return Response.json({ error: 'Fixie backend unreachable' }, { status: 502 });
  }
}
