// Nest app with the real AppModule + configureApp, an in-memory SessionStore and fastify inject.
import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { LightMyRequestResponse } from 'fastify';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { SessionStore } from '../../src/modules/auth/session.store.js';
import { MemorySessionStore } from './memory-session-store.js';

export interface TestApp {
  app: NestFastifyApplication;
  store: MemorySessionStore;
  get: (url: string, cookies?: Record<string, string>) => Promise<LightMyRequestResponse>;
  post: (url: string, cookies?: Record<string, string>) => Promise<LightMyRequestResponse>;
}

export function cookieHeader(cookies: Record<string, string> = {}): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
}

/** Raw (still signed) value of a Set-Cookie of the response. */
export function setCookie(res: LightMyRequestResponse, name: string): string | undefined {
  const cookie = (res.cookies as { name: string; value: string }[]).find((c) => c.name === name);
  return cookie?.value;
}

export function rawSetCookie(res: LightMyRequestResponse, name: string): string {
  const header = res.headers['set-cookie'];
  const all = Array.isArray(header) ? header : header === undefined ? [] : [String(header)];
  return all.find((h) => h.startsWith(`${name}=`)) ?? '';
}

export async function startApp(env: Record<string, string | undefined>): Promise<TestApp> {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const store = new MemorySessionStore();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SessionStore)
    .useValue(store)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app);
  await app.init();
  const fastify = app.getHttpAdapter().getInstance();
  await fastify.ready();
  const call = (method: 'GET' | 'POST') => (url: string, cookies?: Record<string, string>) =>
    fastify.inject({ method, url, headers: cookies ? { cookie: cookieHeader(cookies) } : {} });
  return { app, store, get: call('GET'), post: call('POST') };
}
