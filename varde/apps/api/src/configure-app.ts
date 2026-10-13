import { randomBytes } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sessionSecret } from './config/auth-config.js';
import { QuerySafeExceptionFilter } from './logging/query-safe-exception.filter.js';
import { registerRequestLog } from './logging/request-log.js';

/**
 * Every listener: request log without query (0.6), query-safe exception filter, signed cookies
 * (0.7; without SESSION_SECRET a random per-process key — auth is then not configured anyway).
 */
/** One random key per process when SESSION_SECRET is unset (both listeners must agree). */
const fallbackSecret = randomBytes(32).toString('hex');

export async function configureApp<T extends NestFastifyApplication>(app: T): Promise<T> {
  registerRequestLog(app.getHttpAdapter().getInstance());
  app.useGlobalFilters(new QuerySafeExceptionFilter());
  await app.register(fastifyCookie, {
    secret: sessionSecret() ?? fallbackSecret,
  });
  return app;
}
