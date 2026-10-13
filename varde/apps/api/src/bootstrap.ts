import { randomBytes } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { sessionSecret } from './config/auth-config.js';
import { QuerySafeExceptionFilter } from './logging/query-safe-exception.filter.js';
import { registerRequestLog } from './logging/request-log.js';

export const DEFAULT_PORT = 3000;
/**
 * Fastify listens on 127.0.0.1 by default; inside the container neither Caddy nor
 * `-p` / `--network host` would reach the app, so the host is explicit.
 */
export const LISTEN_HOST = '0.0.0.0';

/**
 * Every listener: request log without query (0.6), query-safe exception filter, signed cookies
 * (0.7; without SESSION_SECRET a random per-process key — auth is then not configured anyway).
 */
export async function configureApp<T extends NestFastifyApplication>(app: T): Promise<T> {
  registerRequestLog(app.getHttpAdapter().getInstance());
  app.useGlobalFilters(new QuerySafeExceptionFilter());
  await app.register(fastifyCookie, {
    secret: sessionSecret() ?? randomBytes(32).toString('hex'),
  });
  return app;
}

export async function createApp(): Promise<NestFastifyApplication> {
  return configureApp(
    await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter()),
  );
}

export function resolvePort(env: NodeJS.ProcessEnv): number {
  const raw = env.PORT;
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid PORT: ${raw}`);
  return port;
}

type Listenable = Pick<NestFastifyApplication, 'listen'>;

export async function bootstrap<T extends Listenable>(
  create: () => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const app = await create();
  await app.listen(resolvePort(env), LISTEN_HOST);
  return app;
}
