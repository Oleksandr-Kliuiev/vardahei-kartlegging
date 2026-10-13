// Task 0.12: the stub of the load stand exists only with flag + token + UNTIL (≤ 4 h); it writes
// like the future Submission API and enqueues demo.hold-connection jobs.
import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { until } from './support/jobs-fixture.js';
import { prisma as prismaCli } from './support/prisma-cli.js';
import { createVardeDb, dropVardeDb, superClient, type VardeDb } from './support/varde-db.js';

const DB = 'varde_s';
const TOKEN = randomBytes(24).toString('hex');
const saved = { ...process.env };
let db: VardeDb;
let app: NestFastifyApplication | undefined;

beforeAll(async () => {
  db = await createVardeDb(DB);
  const migrate = prismaCli(['migrate', 'deploy'], db.appUrl); // as varde_app, like production
  if (migrate.status !== 0) throw new Error(migrate.output);
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  process.env = { ...saved };
});

afterAll(async () => {
  await dropVardeDb(DB);
});

const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

async function start(env: Record<string, string | undefined>): Promise<NestFastifyApplication> {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

const on = (extra: Record<string, string | undefined> = {}) => ({
  DATABASE_URL: db.appUrl,
  VARDE_STUB_SUBMIT: '1',
  VARDE_STUB_TOKEN: TOKEN,
  VARDE_STUB_UNTIL: inMs(3600_000),
  ...extra,
});

function call(
  a: NestFastifyApplication,
  method: 'GET' | 'POST',
  url: string,
  token?: string,
  payload?: object,
) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers['x-varde-stub-token'] = token;
  return a
    .getHttpAdapter()
    .getInstance()
    .inject({ method, url, headers, ...(payload ? { payload } : {}) });
}

async function statuses(a: NestFastifyApplication, token?: string): Promise<number[]> {
  const body = { submission_id: randomUUID(), answers: { q1: 3 } };
  return [
    (await call(a, 'POST', '/stub/submit', token, body)).statusCode,
    (await call(a, 'POST', '/stub/enqueue-hold?n=3', token)).statusCode,
    (await call(a, 'GET', '/stub/slow', token)).statusCode,
  ];
}

describe('stub of the load stand (0.12)', () => {
  it('flag off → 404 on all three routes', async () => {
    const a = await start({ ...on(), VARDE_STUB_SUBMIT: undefined, DATABASE_URL: undefined });
    expect(await statuses(a, TOKEN)).toEqual([404, 404, 404]);
  });

  it('without or with a wrong token → 404', async () => {
    const a = await start(on({ DATABASE_URL: undefined }));
    expect(await statuses(a)).toEqual([404, 404, 404]);
    expect(await statuses(a, `${TOKEN.slice(1)}x`)).toEqual([404, 404, 404]);
  });

  it('UNTIL in the past, or passed while running → 404', async () => {
    let a = await start(on({ DATABASE_URL: undefined, VARDE_STUB_UNTIL: inMs(-1000) }));
    expect(await statuses(a, TOKEN)).toEqual([404, 404, 404]);
    await a.close();
    a = await start(on({ DATABASE_URL: undefined, VARDE_STUB_UNTIL: inMs(800) }));
    await new Promise((r) => setTimeout(r, 1000));
    expect(await statuses(a, TOKEN)).toEqual([404, 404, 404]);
  });

  it('UNTIL beyond 4 h → the module is not enabled', async () => {
    const a = await start(
      on({ DATABASE_URL: undefined, VARDE_STUB_UNTIL: inMs(4 * 3600_000 + 60_000) }),
    );
    expect(await statuses(a, TOKEN)).toEqual([404, 404, 404]);
  });

  it('enabled → one row in stub_submission; the same submission_id again → 409', async () => {
    const a = await start(on());
    const body = {
      submission_id: randomUUID(),
      answers: Object.fromEntries([...Array(40).keys()].map((i) => [`q${i}`, i % 5])),
    };
    expect((await call(a, 'POST', '/stub/submit', TOKEN, body)).statusCode).toBe(201);
    expect((await call(a, 'POST', '/stub/submit', TOKEN, body)).statusCode).toBe(409);
    expect((await call(a, 'POST', '/stub/submit', TOKEN, { answers: {} })).statusCode).toBe(400);
    const su = await superClient(DB);
    try {
      const r = await su.query('SELECT answers FROM stub_submission WHERE submission_id = $1', [
        body.submission_id,
      ]);
      expect(r.rowCount).toBe(1);
      expect(Object.keys((r.rows[0] as { answers: object }).answers)).toHaveLength(40);
    } finally {
      await su.end();
    }
  });

  it('enqueue-hold?n=3 → three demo.hold-connection jobs', async () => {
    const a = await start(on());
    const jobs = a.get(JobsService);
    await until(
      () => Promise.resolve(jobs.running),
      (r) => r,
      20_000,
    );
    const res = await call(a, 'POST', '/stub/enqueue-hold?n=3', TOKEN);
    expect(res.statusCode).toBe(202);
    const ids = res.json<{ ids: string[] }>().ids;
    expect(ids).toHaveLength(3);
    for (const id of ids)
      expect((await jobs.getJob('demo.hold-connection', id))?.name).toBe('demo.hold-connection');
  });
});
