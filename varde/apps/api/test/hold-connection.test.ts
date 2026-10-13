// Task 0.12: demo.hold-connection keeps one varde_app connection "idle in transaction" for
// ≥ 20 s while it waits for /stub/slow, then completes (no Prisma transaction timeout).
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDbBudget } from '../src/config/db-budget.js';
import { holdConnection } from '../src/jobs/demo-jobs.js';
import { loadJobTypes } from '../src/jobs/job-config.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { sleep } from './support/jobs-fixture.js';
import { createVardeDb, dropVardeDb, superClient, type VardeDb } from './support/varde-db.js';

const DB = 'varde_h';
const HOLD_MS = 20_000;
let db: VardeDb;
let jobs: JobsService;
let prisma: PrismaClient;
let slow: Server;
let slowUrl = '';
let tokenSeen: string | undefined;

beforeAll(async () => {
  db = await createVardeDb(DB);
  slow = createServer((req, res) => {
    tokenSeen = req.headers['x-varde-stub-token'] as string | undefined;
    setTimeout(() => res.end('{}'), HOLD_MS);
  });
  await new Promise<void>((r) => slow.listen(0, '127.0.0.1', r));
  slowUrl = `http://127.0.0.1:${(slow.address() as AddressInfo).port}/stub/slow`;
  prisma = new PrismaClient({ datasourceUrl: db.appUrl });
  jobs = new JobsService(loadJobTypes(), {
    connectionString: db.appUrl,
    max: readDbBudget().pgboss_pool,
  });
  await jobs.register('demo.hold-connection', () => holdConnection(prisma, slowUrl, 'tok'));
  await jobs.start();
});

afterAll(async () => {
  await jobs?.stop();
  await prisma?.$disconnect();
  await new Promise((r) => slow?.close(r));
  await dropVardeDb(DB);
});

describe('demo.hold-connection (0.12)', () => {
  it('holds a varde_app connection idle in transaction ≥ 20 s, then completes', async () => {
    const id = await jobs.enqueue('demo.hold-connection', { id: randomUUID() });
    const su = await superClient();
    let first: number | undefined;
    let last: number | undefined;
    let state: string | undefined;
    try {
      const deadline = Date.now() + 50_000;
      while (Date.now() < deadline) {
        const r = await su.query<{ n: string }>(
          `SELECT count(*) AS n FROM pg_stat_activity
            WHERE datname = $1 AND usename = 'varde_app' AND state = 'idle in transaction'`,
          [DB],
        );
        if (Number(r.rows[0]?.n) > 0) {
          first ??= Date.now();
          last = Date.now();
        }
        state = (await jobs.getJob('demo.hold-connection', id ?? ''))?.state;
        if (state === 'completed' || state === 'failed') break;
        await sleep(500);
      }
    } finally {
      await su.end();
    }
    expect(state).toBe('completed');
    expect(first).toBeDefined();
    expect((last ?? 0) - (first ?? 0)).toBeGreaterThanOrEqual(HOLD_MS - 1500);
    expect(tokenSeen).toBe('tok');
  }, 60_000);
});
