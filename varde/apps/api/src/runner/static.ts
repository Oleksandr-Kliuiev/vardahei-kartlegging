import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export const RUNNER_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
/** The admin previews may be framed by Varde itself: the phone frame in the editor (`/r?preview=<version>`,
 * admin session only, 1.46) and the big screen in the seminar's «Live» tab (`/p?preview`, data from the
 * admin page by postMessage, 3.5). */
export const RUNNER_PREVIEW_CSP = RUNNER_CSP.replace(
  "frame-ancestors 'none'",
  "frame-ancestors 'self'",
);
const isPreview = (url: string) => new URLSearchParams(url.split('?')[1] ?? '').has('preview');

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
    if (
      path.startsWith('/api/runner/') ||
      path.startsWith('/api/admin/round') ||
      path.startsWith('/api/public/')
    )
      void reply.header('cache-control', 'no-store');
    // The seminar page (3.2) and the big screen of a live poll (3.5) are more entries of the runner
    // build, under the same headers. The big screen's key is in the fragment: never in this URL.
    if (path === '/r' || path.startsWith('/r/') || ['/s', '/s/', '/p', '/p/'].includes(path)) {
      const preview = ['/r', '/r/', '/p', '/p/'].includes(path) && isPreview(request.url);
      void reply
        .header('content-security-policy', preview ? RUNNER_PREVIEW_CSP : RUNNER_CSP)
        .header('referrer-policy', 'no-referrer')
        .header('x-frame-options', preview ? 'SAMEORIGIN' : 'DENY')
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
    // @fastify/static 10 passes the reply itself (before: the raw response).
    setHeaders(reply, path) {
      void reply.header(
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
  if (!existsSync(resolve(root, 'seminar.html'))) return;
  const seminar = (_request: FastifyRequest, reply: FastifyReply) =>
    reply
      .header('cache-control', 'no-store')
      .sendFile('seminar.html', root, { cacheControl: false, etag: false, lastModified: false });
  fastify.get('/s', seminar);
  fastify.get('/s/', seminar);
  if (!existsSync(resolve(root, 'presenter.html'))) return;
  const presenter = (_request: FastifyRequest, reply: FastifyReply) =>
    reply
      .header('cache-control', 'no-store')
      .sendFile('presenter.html', root, { cacheControl: false, etag: false, lastModified: false });
  fastify.get('/p', presenter);
  fastify.get('/p/', presenter);
}
