// Task 1.0: the load stand of 0.12 is removed (decision 13.10): routes answer 404 even with the
// old environment variables set, and the migration has dropped the stub_submission table.
import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { prisma as prismaCli } from './support/prisma-cli.js';
import pg from 'pg';
import { createVardeDb, dropVardeDb, type VardeDb } from './support/varde-db.js';

const DB = 'varde_sr';
const saved = { ...process.env };
let db: VardeDb;
let app: NestFastifyApplication;

beforeAll(async () => {
  db = await createVardeDb(DB);
  const migrate = prismaCli(['migrate', 'deploy'], db.appUrl);
  if (migrate.status !== 0) throw new Error(migrate.output);
  // The former switch of the stand: must have no effect any more.
  process.env.VARDE_STUB_SUBMIT = '1';
  process.env.VARDE_STUB_TOKEN = 'x'.repeat(48);
  process.env.VARDE_STUB_UNTIL = new Date(Date.now() + 3600_000).toISOString();
  delete process.env.DATABASE_URL;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  process.env = { ...saved };
  await dropVardeDb(DB);
});

const call = (method: 'GET' | 'POST', url: string) =>
  app
    .getHttpAdapter()
    .getInstance()
    .inject({ method, url, headers: { 'x-varde-stub-token': 'x'.repeat(48) } });

describe('stub removed (1.0)', () => {
  it('POST /stub/submit → 404', async () => {
    expect((await call('POST', '/stub/submit')).statusCode).toBe(404);
  });

  it('GET /stub/slow → 404', async () => {
    expect((await call('GET', '/stub/slow')).statusCode).toBe(404);
  });

  it("to_regclass('stub_submission') → null after migrate deploy", async () => {
    // DATABASE_URL is unset for the app (no database needed), so connect by the test's own URL.
    const su = new pg.Client({ connectionString: db.superUrl });
    await su.connect();
    try {
      const r = await su.query<{ t: string | null }>(
        "SELECT to_regclass('stub_submission')::text AS t",
      );
      expect(r.rows[0]?.t).toBeNull();
    } finally {
      await su.end();
    }
  });
});
