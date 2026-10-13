// Task 0.6: GET /health — 200 {status, version, db} with a database, 503 without; no auth.
import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const original = { ...process.env };
let app: NestFastifyApplication | undefined;

afterEach(async () => {
  await app?.close();
  process.env = { ...original };
});

async function start(prisma?: object): Promise<NestFastifyApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (prisma) builder = builder.overrideProvider(PrismaService).useValue(prisma);
  const moduleRef = await builder.compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('GET /health', () => {
  it('200 with the image version when SELECT 1 answers', async () => {
    process.env.VARDE_VERSION = 'abc1234';
    const a = await start({ $queryRaw: () => Promise.resolve([{ '?column?': 1 }]) });
    const res = await a.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: 'abc1234', db: 'ok' });
  });

  it('503 when the database is unreachable', async () => {
    process.env.DATABASE_URL = 'postgresql://x:x@127.0.0.1:1/x';
    const a = await start();
    const res = await a.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ db: 'down', version: 'dev' });
  });
});
