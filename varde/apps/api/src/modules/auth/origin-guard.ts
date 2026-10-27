// Origin check on state-changing requests of the admin API and the login routes (1.3). The session
// cookie is SameSite=Lax, but every *.vardahei.tech site (Atlas and others) is same-site with Varde, so Lax
// alone does not stop a request from a sibling site. A browser sends Origin on every POST/PUT/PATCH/DELETE
// (and on any cross-origin request), so a request from another origin is refused; a request with no Origin
// does not come from a browser page and is judged by its session cookie as before.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { publicOrigin } from '../seminars/seminars.service.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function originAllowed(
  request: Pick<FastifyRequest, 'method' | 'url' | 'headers'>,
  publicHost: string | null,
): boolean {
  if (!UNSAFE.has(request.method)) return true;
  const path = request.url.split('?')[0] ?? '';
  if (!path.startsWith('/api/admin/') && !path.startsWith('/auth/')) return true;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  let host: string;
  try {
    host = new URL(origin).host; // "null" (sandboxed frame, some redirects) does not parse
  } catch {
    return false;
  }
  return host === request.headers.host || host === publicHost;
}

export function registerOriginGuard(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (request, reply) => {
    if (originAllowed(request, publicOrigin()?.host ?? null)) return;
    return reply.status(403).send({ statusCode: 403, message: 'Forbidden' });
  });
}
