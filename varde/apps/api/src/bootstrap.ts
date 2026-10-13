import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { QuerySafeExceptionFilter } from './logging/query-safe-exception.filter.js';
import { registerRequestLog } from './logging/request-log.js';

export const DEFAULT_PORT = 3000;
/**
 * Fastify listens on 127.0.0.1 by default; inside the container neither Caddy nor
 * `-p` / `--network host` would reach the app, so the host is explicit.
 */
export const LISTEN_HOST = '0.0.0.0';

/** Request log without query (0.6) and the query-safe exception filter on every listener. */
export function configureApp<T extends NestFastifyApplication>(app: T): T {
  registerRequestLog(app.getHttpAdapter().getInstance());
  app.useGlobalFilters(new QuerySafeExceptionFilter());
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
