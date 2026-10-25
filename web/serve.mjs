#!/usr/bin/env node
// Serves the Fixie board and proxies its admin hotkeys, with no dependencies.
//   node web/serve.mjs            → http://127.0.0.1:8080/
// - Static files from web/.
// - GET  /replay/events.jsonl → server/data/events.jsonl (read-only), for ?replay=1.
// - POST /admin/<path>        → <server>/<path> with the x-admin header added here from the repo-root .env (ADMIN_TOKEN).
//   The token is never sent to the browser or printed.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = dirname(fileURLToPath(import.meta.url));
const ROOT = join(WEB, '..');
const ENV_FILE = process.env.ENV_FILE || join(ROOT, '.env');
const EVENTS_FILE = join(ROOT, 'server', 'data', 'events.jsonl');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const DEFAULT_SERVER = (process.env.FIXIE_SERVER || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_PATHS = /^\/(demo\/sim-intake|demo\/reset|demo\/mode|simulate\/delivered|fault|jobs\/[\w-]+\/stop)$/;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
                '.jsonl': 'application/x-ndjson', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css', '.md': 'text/plain; charset=utf-8' };

// Re-read on every request so editing the repo-root .env needs no restart. Same default as server/src/config.ts.
function adminToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  try {
    const line = readFileSync(ENV_FILE, 'utf8').split('\n').find((l) => /^\s*ADMIN_TOKEN\s*=/.test(l));
    const v = line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    if (v) return v;
  } catch { /* no .env */ }
  return 'fixie-demo';
}

// Only forward the admin token to a server on this machine.
function targetServer(req) {
  const h = req.headers['x-fixie-server'];
  try {
    const u = new URL(String(h || DEFAULT_SERVER));
    if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return u.origin;
  } catch { /* fall through */ }
  return DEFAULT_SERVER;
}

const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res(b)); });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/admin/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, server: DEFAULT_SERVER }));
    }
    if (url.pathname.startsWith('/admin/')) {
      const path = url.pathname.slice('/admin'.length);
      if (req.method !== 'POST' || !ADMIN_PATHS.test(path)) { res.writeHead(404); return res.end('not an admin route'); }
      const r = await fetch(targetServer(req) + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin': adminToken() }, body: (await readBody(req)) || '{}',
      });
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'text/plain' });
      return res.end(await r.text());
    }
    if (url.pathname === '/replay/events.jsonl') {
      await stat(EVENTS_FILE);
      res.writeHead(200, { 'Content-Type': TYPES['.jsonl'], 'Cache-Control': 'no-store' });
      return createReadStream(EVENTS_FILE).pipe(res);
    }
    const rel = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^([/\\])+/, '');
    const file = join(WEB, rel);
    if (!file.startsWith(WEB + sep) || /(^|[/\\])\./.test(rel)) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (err) {
    const missing = err?.code === 'ENOENT';
    res.writeHead(missing ? 404 : 502, { 'Content-Type': 'text/plain' });
    res.end(missing ? 'not found' : `proxy error: ${err?.message ?? err}`);
  }
}).listen(PORT, HOST, () => {
  const base = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log(`Fixie board → ${base}/            live (SSE from ${DEFAULT_SERVER}/events)`);
  console.log(`              ${base}/?replay=1   replay server/data/events.jsonl (falls back to sample-real-sim-run.jsonl)`);
  console.log(`              ${base}/?mock=1     scripted demo, no server`);
  console.log(`Hotkeys: I sim intake · D delivered · P port fault · X kill switch (admin token added by this proxy, never sent to the browser)`);
});
