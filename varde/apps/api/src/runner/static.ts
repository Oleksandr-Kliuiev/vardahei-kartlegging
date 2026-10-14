import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export const RUNNER_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

/** Register on Fastify so assets do not involve Nest or database access. */
export async function registerRunnerStatic(app: NestFastifyApplication): Promise<void> {
  const root = resolve(process.env.VARDE_STATIC_DIR ?? resolve(__dirname, '../../../runner/dist'));
  const fastify = app.getHttpAdapter().getInstance();
  // API errors also must not be cached; a closed/revoked code must never use a cached round.
  fastify.addHook('onRequest', (request, reply, done) => {
    const path = request.url.split('?')[0]!;
    if (path.startsWith('/r/assets/') || path.startsWith('/admin/assets/')) {
      try {
        const decoded = decodeURIComponent(path);
        if (decoded.includes('..') || decoded.includes('\\')) {
          void reply.status(404).send();
          return;
        }
      } catch {
        void reply.status(404).send();
        return;
      }
    }
    if (path.startsWith('/api/runner/') || path.startsWith('/api/admin/round'))
      void reply.header('cache-control', 'no-store');
    if (path === '/r' || path.startsWith('/r/')) {
      void reply
        .header('content-security-policy', RUNNER_CSP)
        .header('referrer-policy', 'no-referrer')
        .header('x-frame-options', 'DENY')
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', 'no-store');
    }
    done();
  });
  if (!existsSync(resolve(root, 'index.html'))) return;
  await app.register(fastifyStatic, {
    root: resolve(root, 'assets'),
    prefix: '/r/assets/',
    decorateReply: true,
    immutable: true,
    maxAge: '1y',
    index: false,
    setHeaders(res, path) {
      res.setHeader(
        'cache-control',
        path === resolve(root, 'index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
      );
    },
  });
  const index = (_request: FastifyRequest, reply: FastifyReply) =>
    reply
      .header('cache-control', 'no-store')
      .sendFile('index.html', root, { cacheControl: false, etag: false, lastModified: false });
  fastify.get('/r', index);
  fastify.get('/r/', index);
}
