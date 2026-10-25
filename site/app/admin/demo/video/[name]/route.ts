import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { isAdmin } from '../../../_lib/auth';

// Rendered by video/ (npx remotion render Stage|Submission); real call audio, so admin-only and never in public/.
const FILES: Record<string, string> = {
  stage: 'fixie-stage.mp4',
  montage: 'fixie-montage.mp4',
};

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await isAdmin())) return new Response('unauthorized', { status: 401 });
  const file = FILES[(await params).name];
  if (!file) return new Response('not found', { status: 404 });
  const full = path.join(process.cwd(), '..', 'demo-assets', file);
  let size: number;
  try {
    size = statSync(full).size;
  } catch {
    return new Response(`${file} not rendered yet`, { status: 404 });
  }
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '');
  if (!range) {
    const body = Readable.toWeb(createReadStream(full)) as ReadableStream;
    return new Response(body, { headers: { ...headers, 'Content-Length': String(size) } });
  }
  const start = range[1] ? Number(range[1]) : size - Number(range[2]);
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  const body = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
  return new Response(body, {
    status: 206,
    headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
  });
}
