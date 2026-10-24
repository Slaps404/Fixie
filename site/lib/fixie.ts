import 'server-only';

export const API_URL = (process.env.FIXIE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Server-only fetch to the Fixie backend. Attaches x-admin when asked. */
export function backend(path: string, init: RequestInit & { admin?: boolean } = {}) {
  const { admin, headers, ...rest } = init;
  const h = new Headers(headers);
  if (admin) h.set('x-admin', process.env.FIXIE_ADMIN_TOKEN || '');
  return fetch(`${API_URL}${path}`, { ...rest, headers: h, cache: 'no-store' });
}
