// Task 0.15b: privacy.release() with the history of releases (ADR-021:40, rules 1–6).
import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import * as surface from '../../src/modules/privacy/privacy.service.js';
import {
  type ComputedCell,
  PrivacyService,
  ReleaseRejected,
} from '../../src/modules/privacy/privacy.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { FixtureSource, ROUND_INITIALS } from '../support/fixture-source.js';
import { MemorySnapshotStore } from '../support/memory-snapshot-store.js';

const ROUND = 'r-release';
const AUTO = { type: 'auto', who: 'system' } as const;
const MANUAL = { type: 'manual', who: 'entra:test-admin' } as const;
let audits: { what: string; details: unknown }[];
let store: MemorySnapshotStore;
let privacy: PrivacyService;

beforeEach(() => {
  audits = [];
  store = new MemorySnapshotStore();
  const prisma = {
    auditLog: {
      create: ({ data }: { data: { what: string; details: unknown } }) => {
        audits.push(data);
        return Promise.resolve(data);
      },
    },
  };
  privacy = new PrivacyService(prisma as unknown as PrismaService, new FixtureSource(), {
    k: 3,
    exact_counts: ['responses_total'],
  });
});

const F12 = { metric_key: 'tryggleik.f12_ja', metric_version: 1 };
const cell = (group: string, n: number, numerator: number, over: Partial<ComputedCell> = {}) =>
  ({
    client: 'kunde-a',
    ...F12,
    group,
    n,
    numerator,
    denominator: n,
    missing: 0,
    ...over,
  }) as ComputedCell;

const run = (cells: ComputedCell[], actor: typeof AUTO | typeof MANUAL = AUTO) =>
  privacy.release(ROUND, 'round_client', cells, store, actor);

const find = (r: { released: readonly { group: string }[] }, group: string) =>
  r.released.find((s) => s.group === group);

describe('privacy.release (0.15b)', () => {
  it('(3,3) → (4,3): the cell is carried forward with stale, its JSON holds only the old numbers', async () => {
    await run([cell('all', 6, 3)]);
    const r = await run([cell('all', 7, 4)]);
    const c = find(r, 'all');
    expect(c).toMatchObject({ n: 6, numerator: 3, denominator: 6, stale: true });
    expect(JSON.stringify(c)).not.toMatch(/"n":7|"numerator":4|"denominator":7/);
  });

  it('total +4 with role A +3 and role B +1 → role B and one of {total, role A} carried forward', async () => {
    await run([cell('all', 6, 3), cell('role:a', 3, 1), cell('role:b', 3, 2)]);
    const r = await run([cell('all', 10, 5), cell('role:a', 6, 2), cell('role:b', 4, 3)]);
    expect(find(r, 'role:b')).toMatchObject({ n: 3, stale: true });
    const stale = (g: string) => (find(r, g) as { stale?: boolean }).stale === true;
    expect(stale('all') || stale('role:a')).toBe(true);
  });

  it('manual release after one new response → no answer cell changes; AuditLog privacy.release.manual', async () => {
    const first = await run([cell('all', 6, 3), cell('role:a', 3, 1), cell('role:b', 3, 2)]);
    const r = await run([cell('all', 7, 4), cell('role:a', 4, 2), cell('role:b', 3, 2)], MANUAL);
    for (const s of r.released) {
      const before = find(first, s.group) as unknown as { n: number; numerator: number };
      expect([s.n, s.numerator]).toEqual([before.n, before.numerator]);
    }
    expect(audits.map((a) => a.what)).toEqual(['privacy.release.auto', 'privacy.release.manual']);
  });

  it('drop-out per question 2 → 3 → carried forward until Δn ≥ k', async () => {
    const drop = (n: number, numerator: number) =>
      cell('question:F5', n, numerator, { metric_key: 'progress.dropout' });
    await run([drop(10, 2)]);
    const second = await run([drop(11, 3)]);
    expect(find(second, 'question:F5')).toMatchObject({ n: 10, numerator: 2, stale: true });
    const third = await run([drop(13, 4)]);
    expect(find(third, 'question:F5')).toMatchObject({ n: 13, numerator: 4, suppressed: false });
    expect(find(third, 'question:F5')).not.toHaveProperty('stale');
  });

  it('first release: n < k suppressed, also the group recoverable by subtraction', async () => {
    const r = await run([cell('all', 5, 3), cell('role:a', 3, 1), cell('role:b', 2, 2)]);
    expect(find(r, 'role:b')).toMatchObject({ suppressed: true, n: 0, numerator: 0 });
    expect(find(r, 'role:a')).toMatchObject({ suppressed: true });
    expect(find(r, 'all')).toMatchObject({ suppressed: false, n: 5 });
  });

  it('a new metric for a round that already has a release → ReleaseRejected', async () => {
    await run([cell('all', 6, 3)]);
    await expect(
      run([cell('all', 6, 3), cell('all', 6, 1, { metric_key: 'tryggleik.f5_ja' })]),
    ).rejects.toBeInstanceOf(ReleaseRejected);
  });

  it('the previous released snapshot becomes superseded with a reason and is kept', async () => {
    await run([cell('all', 6, 3)]);
    await run([cell('all', 9, 4)]);
    expect(store.all.map((s) => s.status)).toEqual(['superseded', 'released']);
    expect(store.all[0]).toMatchObject({ n: 6, superseded_reason: 'new release' });
    expect(store.all[1]).toMatchObject({ n: 9, numerator: 4 });
  });

  it('responses_total on a RoundClient changes exactly (named exception)', async () => {
    const total = (n: number) => cell('all', n, n, { metric_key: 'responses_total', missing: 0 });
    expect(find(await run([total(2)]), 'all')).toMatchObject({ n: 2, suppressed: false });
    expect(find(await run([total(3)]), 'all')).toMatchObject({ n: 3, suppressed: false });
    expect(find(await run([total(4)]), 'all')).not.toHaveProperty('stale');
  });

  it('release() without an actor → rejected', async () => {
    await expect(
      privacy.release(ROUND, 'round_client', [cell('all', 6, 3)], store, undefined as never),
    ).rejects.toBeInstanceOf(ReleaseRejected);
    await expect(
      privacy.release(ROUND, 'round_client', [], store, { type: 'manual', who: '' }),
    ).rejects.toBeInstanceOf(ReleaseRejected);
    expect(store.writes).toBe(0);
  });

  it('markReleased is not reachable from the public surface of the module', async () => {
    expect(Object.keys(surface)).not.toContain('markReleased');
    // A deep import, only to prove the function is not exported by release.ts either.
    const mod = (await import('../../src/modules/privacy/release.js')) as Record<string, unknown>;
    expect(Object.keys(mod)).not.toContain('markReleased');
    expect(Object.keys(mod).filter((k) => /mark/i.test(k))).toEqual([]);
  });

  it('the live view aggregate() never writes to the SnapshotStore', async () => {
    await privacy.aggregate({
      round: ROUND_INITIALS,
      population: 'all_clients',
      part: 'common',
      question: 'F12',
      option: 'ja',
    });
    expect(store.writes).toBe(0);
    expect(store.all).toEqual([]);
  });
});
