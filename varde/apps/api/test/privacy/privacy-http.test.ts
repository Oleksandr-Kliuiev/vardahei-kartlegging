// Task 0.15 e2e on the test controller: GET /test/rows without a cookie → 401; GET
// /test/per-employee in an anonymous round with an admin session → 404.
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/configure-app.js';
import { AuthModule } from '../../src/modules/auth/auth.module.js';
import { SessionStore } from '../../src/modules/auth/session.store.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { cookieHeader } from '../support/auth-app.js';
import { FixtureSource, ROUND_ANONYMOUS } from '../support/fixture-source.js';
import { MemorySessionStore } from '../support/memory-session-store.js';
import { PrivacyTestController } from '../support/privacy-test.controller.js';

const saved = { ...process.env };
const store = new MemorySessionStore();
let app: NestFastifyApplication;

beforeAll(async () => {
  process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule.register('main')],
    controllers: [PrivacyTestController],
    providers: [
      // No database: 401 comes from the guard, 404 from the mode check before any transaction.
      { provide: PrismaService, useValue: {} },
      {
        provide: PrivacyService,
        useFactory: (prisma: PrismaService) =>
          new PrivacyService(prisma, new FixtureSource(), { k: 3, exact_counts: [] }),
        inject: [PrismaService],
      },
    ],
  })
    .overrideProvider(SessionStore)
    .useValue(store)
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
  process.env = { ...saved };
});

const inject = (url: string, cookies?: Record<string, string>) =>
  app
    .getHttpAdapter()
    .getInstance()
    .inject({ method: 'GET', url, headers: cookies ? { cookie: cookieHeader(cookies) } : {} });

describe('privacy over HTTP (0.15)', () => {
  it('GET /test/rows without a cookie → 401', async () => {
    const res = await inject(`/test/rows?round=${ROUND_ANONYMOUS}`);
    expect(res.statusCode).toBe(401);
  });

  it('GET /test/per-employee in an anonymous round → 404', async () => {
    const s = await store.create({
      oid: 'o',
      name: 'Test Admin',
      via: 'entra',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const signed = app.getHttpAdapter().getInstance().signCookie(s.sid);
    const res = await inject(`/test/per-employee?round=${ROUND_ANONYMOUS}`, {
      '__Host-varde_session': signed,
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toMatch(/respondent_key|answers/);
  });
});
