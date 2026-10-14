// Task 0.9: pg-boss limits, idempotency keys, strict payloads, backup coverage of pgboss.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDbBudget } from '../src/config/db-budget.js';
import { loadJobTypes, STAGE0_JOBS } from '../src/jobs/job-config.js';
import { JobPayloadRejected, JobsService } from '../src/jobs/jobs.service.js';
import { jobsConfigDir, sleep, until } from './support/jobs-fixture.js';
import { createVardeDb, dropVardeDb, pgDump, type VardeDb } from './support/varde-db.js';

const DB = 'varde_j';
const REGISTRY = {
  ...STAGE0_JOBS,
  'test.stately': (p: { id: string }) => `test.stately:${p.id}`,
  'test.singleton': (p: { id: string }) => `test.singleton:${p.id}`,
};
// Config override as in the package: retryDelaySeconds 1, timeoutSeconds 2.
const CONFIG = {
  defaults: {
    concurrency: 1,
    timeoutSeconds: 2,
    retryLimit: 3,
    retryBackoff: 'exponential',
    retryDelaySeconds: 1,
    policy: 'stately',
    pollingIntervalSeconds: 0.5,
  },
  types: {
    'demo.sleep': { settings: { sleepSeconds: 5 } },
    'test.stately': {},
    'test.singleton': { policy: 'singleton', concurrency: 2, timeoutSeconds: 30 },
  },
};

let db: VardeDb;
let jobs: JobsService;

beforeAll(async () => {
  db = await createVardeDb(DB);
  const env = { VARDE_CONFIG_DIR: jobsConfigDir(CONFIG) };
  jobs = new JobsService(loadJobTypes(env, REGISTRY), {
    connectionString: db.appUrl,
    max: readDbBudget().pgboss_pool,
  });
  await jobs.start();
});

afterAll(async () => {
  await jobs?.stop();
  await dropVardeDb(DB);
});

const state = async (name: string, id: string | null): Promise<string | undefined> =>
  (await jobs.getJob(name, id ?? ''))?.state;

describe('pg-boss jobs (0.9)', () => {
  it('timeout + retry limit: a 5 s job with timeoutSeconds 2 fails after 4 calls, backoff grows', async () => {
    const calls: number[] = [];
    await jobs.register('demo.sleep', async () => {
      calls.push(Date.now());
      await sleep(5000);
    });
    const id = await jobs.enqueue('demo.sleep', { id: randomUUID() });
    expect(
      await until(
        () => state('demo.sleep', id),
        (s) => s === 'failed',
        55_000,
      ),
    ).toBe('failed');
    expect(calls).toHaveLength(4);
    const gaps = calls.slice(1).map((t, i) => t - (calls[i] ?? 0));
    expect(gaps[2] ?? 0).toBeGreaterThan(gaps[0] ?? 0);
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i] ?? 0).toBeGreaterThan((gaps[i - 1] ?? 0) - 750);
    }
  }, 60_000);

  it('stately: the same key while created → one job; after completed → a new one', async () => {
    const payload = { id: randomUUID() };
    const first = await jobs.enqueue('test.stately', payload);
    expect(first).not.toBeNull();
    expect(await jobs.enqueue('test.stately', payload)).toBeNull();

    await jobs.register('test.stately', () => Promise.resolve());
    expect(
      await until(
        () => state('test.stately', first),
        (s) => s === 'completed',
      ),
    ).toBe('completed');
    const again = await jobs.enqueue('test.stately', payload);
    expect(again).not.toBeNull();
    expect(again).not.toBe(first);
  });

  it('singleton: a second job with the same key waits in created while the first is active', async () => {
    let running = 0;
    let maxRunning = 0;
    await jobs.register('test.singleton', async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await sleep(3000);
      running -= 1;
    });
    const payload = { id: randomUUID() };
    const a = await jobs.enqueue('test.singleton', payload);
    expect(
      await until(
        () => state('test.singleton', a),
        (s) => s === 'active',
      ),
    ).toBe('active');
    const b = await jobs.enqueue('test.singleton', payload);
    expect(b).not.toBeNull();
    while ((await state('test.singleton', a)) === 'active') {
      expect(await state('test.singleton', b)).toBe('created');
      await sleep(250);
    }
    expect(
      await until(
        () => state('test.singleton', b),
        (s) => s === 'completed',
      ),
    ).toBe('completed');
    expect(maxRunning).toBe(1);
  }, 30_000);

  it.each([
    ['an extra field (answers)', { id: randomUUID(), answers: { q1: 'x' } }],
    ['JSON in hash', { id: randomUUID(), hash: JSON.stringify({ a: 1 }) }],
    ['a hash of another length', { id: randomUUID(), hash: 'ab'.repeat(16) }],
    ['a non-uuid id', { id: 'respondent-1' }],
  ])('rejects a payload with %s', async (_label, payload) => {
    await expect(jobs.enqueue('demo.sleep', payload)).rejects.toBeInstanceOf(JobPayloadRejected);
  });

  it('accepts id + sha256 hash', async () => {
    const id = await jobs.enqueue('test.stately', { id: randomUUID(), hash: 'a'.repeat(64) });
    expect(id).not.toBeNull();
  });

  it('pg_dump -Fc as varde_backup succeeds after pg-boss created its schema', () => {
    const dump = pgDump(db.backupUrl);
    expect(dump.status, dump.output).toBe(0);
  });
});
