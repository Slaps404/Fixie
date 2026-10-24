import 'server-only';

export const API_URL = (process.env.FIXIE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// The server's default admin token (server/src/config.ts) unless FIXIE_ADMIN_TOKEN overrides it.
const ADMIN_TOKEN = process.env.FIXIE_ADMIN_TOKEN || 'fixie-demo';

export function backend(path: string, init: RequestInit & { admin?: boolean } = {}) {
  const { admin, headers, ...rest } = init;
  const h = new Headers(headers);
  if (admin) h.set('x-admin', ADMIN_TOKEN);
  return fetch(`${API_URL}${path}`, { ...rest, headers: h, cache: 'no-store' });
}
