import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SessionService } from '../modules/auth/session.service.js';
import { RUNNER_CSP } from '../runner/static.js';

export async function registerAdminStatic(app: NestFastifyApplication): Promise<void> {
  const root = resolve(
    process.env.VARDE_ADMIN_STATIC_DIR ?? resolve(__dirname, '../../../admin/dist'),
  );
  const server = app.getHttpAdapter().getInstance();
  const sessions = app.get(SessionService);
  server.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    if (path.startsWith('/api/admin/')) void reply.header('cache-control', 'no-store');
    if (path !== '/admin' && !path.startsWith('/admin/')) return;
    // Poster has its own, narrower CSP; retain it rather than replacing its policy.
    if (path.startsWith('/admin/poster/')) return;
    void reply
      .header('content-security-policy', RUNNER_CSP)
      .header('referrer-policy', 'no-referrer')
      .header('x-frame-options', 'DENY')
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'no-store');
    if ((await sessions.resolve(request)) === null) {
      if (path.startsWith('/admin/assets/')) void reply.status(401).send();
      else void reply.redirect('/auth/login', 302);
    }
  });
  if (!existsSync(resolve(root, 'index.html'))) return;
  await app.register(fastifyStatic, {
    root: resolve(root, 'assets'),
    prefix: '/admin/assets/',
    decorateReply: !server.hasReplyDecorator('sendFile'),
    index: false,
    cacheControl: false,
  });
  const index = (_request: unknown, reply: import('fastify').FastifyReply) =>
    reply.sendFile('index.html', root, { cacheControl: false, etag: false, lastModified: false });
  server.get('/admin', index);
  server.get('/admin/*', (request, reply) => {
    // Missing assets must not accidentally return SPA HTML.
    const path = request.url.split('?')[0]!;
    if (path.startsWith('/admin/assets/') || /\.[^/]+$/.test(path)) return reply.status(404).send();
    return index(request, reply);
  });
}
