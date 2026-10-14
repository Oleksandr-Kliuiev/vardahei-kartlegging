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
import { assertReleaseSafety } from '../support/release-safety.js';
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

// Metric names as constants: `key: '<dotted name>'` literals look like API keys to gitleaks.
const F12_JA = 'tryggleik.f12_ja';
const F5_JA = 'tryggleik.f5_ja';
const F12 = { metric_key: F12_JA, metric_version: 1 };
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

  it('all_clients suppresses roles and clients independently', async () => {
    const cells = [
      cell('all', 20, 9),
      cell('client:a', 18, 8),
      cell('client:b', 2, 1),
      cell('role:x', 18, 8),
      cell('role:y', 2, 1),
    ].map((c) => {
      const out = { ...c };
      delete out.client;
      return out;
    });
    const r = await privacy.release(ROUND, 'all_clients', cells, store, AUTO);
    expect(find(r, 'all')).toMatchObject({ n: 20, numerator: 9, suppressed: false });
    for (const g of ['client:a', 'client:b', 'role:x', 'role:y']) {
      expect(find(r, g)).toMatchObject({ n: 0, numerator: 0, suppressed: true });
    }
  });

  it('an unlisted remainder below k needs complementary suppression', async () => {
    const r = await run([cell('all', 20, 9), cell('role:x', 18, 8)]);
    expect(find(r, 'role:x')).toMatchObject({ suppressed: true });
  });

  it('history differences protect each overlapping partition and its unlisted remainder', async () => {
    const cells = (n: number, a: number, b: number, x: number) =>
      [cell('all', n, 0), cell('client:a', a, 0), cell('client:b', b, 0), cell('role:x', x, 0)].map(
        (c) => {
          const out = { ...c };
          delete out.client;
          return out;
        },
      );
    await privacy.release(ROUND, 'all_clients', cells(20, 10, 10, 10), store, AUTO);
    const r = await privacy.release(ROUND, 'all_clients', cells(24, 13, 11, 13), store, AUTO);
    for (const g of ['client:a', 'client:b', 'role:x'])
      expect(find(r, g)).toMatchObject({ n: 10, stale: true });
  });

  it.each(['round_client', 'all_clients'] as const)(
    'hidden current and historic groups stay in the diff remainder (%s)',
    async (population) => {
      const cells = (ns: number[]) =>
        ['all', 'role:a', 'role:d', 'role:h', 'role:s'].map((g, i) => {
          const c = cell(g, ns[i]!, Math.floor(ns[i]! / 2));
          if (population === 'all_clients') delete c.client;
          return c;
        });
      const first = await privacy.release(
        ROUND,
        population,
        cells([40, 15, 13, 10, 2]),
        store,
        AUTO,
      );
      const second = await privacy.release(
        ROUND,
        population,
        cells([35, 12, 12, 9, 2]),
        store,
        AUTO,
      );
      assertReleaseSafety(first.released);
      assertReleaseSafety(second.released);
      assertReleaseSafety(second.released, first.released);
      const third = await privacy.release(
        ROUND,
        population,
        cells([45, 18, 14, 10, 3]),
        store,
        AUTO,
      );
      assertReleaseSafety(third.released);
      for (const old of [first, second]) assertReleaseSafety(third.released, old.released);
    },
  );

  it('carry treats client and role partitions independently: 20/10/10/10/10 → 24/13/11/10/14', async () => {
    const cells = (ns: number[]) =>
      ['all', 'client:a', 'client:b', 'role:x', 'role:y'].map((g, i) => {
        const c = cell(g, ns[i]!, ns[i]!);
        delete c.client;
        return c;
      });
    const first = await privacy.release(
      ROUND,
      'all_clients',
      cells([20, 10, 10, 10, 10]),
      store,
      AUTO,
    );
    const second = await privacy.release(
      ROUND,
      'all_clients',
      cells([24, 13, 11, 10, 14]),
      store,
      AUTO,
    );
    expect(find(second, 'client:b')).toMatchObject({ n: 10, numerator: 10, stale: true });
    assertReleaseSafety(second.released);
    assertReleaseSafety(second.released, first.released);
  });

  it('drop-out without a total carries deletions below k, but releases a deletion of k', async () => {
    const drop = (n: number) => cell('question:F5', n, n, { metric_key: 'progress.dropout' });
    const first = await run([drop(10)]);
    const second = await run([drop(9)]);
    expect(find(second, 'question:F5')).toMatchObject({ n: 10, numerator: 10, stale: true });
    const third = await run([drop(7)]);
    expect(find(third, 'question:F5')).toMatchObject({ n: 7, suppressed: false });
    expect(find(third, 'question:F5')).not.toHaveProperty('stale');
    assertReleaseSafety(second.released, first.released);
    assertReleaseSafety(third.released, second.released);
  });

  it('stale groups are checked against the fresh total after carry', async () => {
    const first = await run([
      cell('all', 40, 40),
      cell('role:a', 20, 20),
      cell('role:b', 10, 10),
      cell('role:c', 10, 10),
    ]);
    const second = await run([
      cell('all', 35, 35),
      cell('role:a', 18, 18),
      cell('role:b', 8, 8),
      cell('role:c', 9, 9),
    ]);
    assertReleaseSafety(second.released);
    assertReleaseSafety(second.released, first.released);
  });

  it('groups omitted after deletion remain part of the published partition', async () => {
    const first = await run([cell('all', 20, 20), cell('role:a', 10, 10), cell('role:b', 10, 10)]);
    const second = await run([cell('all', 15, 15), cell('role:a', 15, 15)]);
    expect(find(second, 'role:b')).toBeDefined();
    assertReleaseSafety(second.released);
    assertReleaseSafety(second.released, first.released);
  });

  it('a new metric for a round that already has a release → ReleaseRejected', async () => {
    await run([cell('all', 6, 3)]);
    await expect(
      run([cell('all', 6, 3), cell('all', 6, 1, { metric_key: F5_JA })]),
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

  it('markReleased is not reachable from the public surface of the module', () => {
    expect(Object.keys(surface)).not.toContain('markReleased');
    expect(Object.keys(surface)).not.toContain('PrismaResponseSource');
    expect(Object.keys(surface)).not.toContain('ResponseStore');
    for (const name of ['RESPONSE_SOURCE', 'privacyProviders', 'prismaPrivacyProviders'])
      expect(Object.keys(surface)).not.toContain(name);
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

describe('cell shape by population and the exact counter (1.10b)', () => {
  const leader = (over: Partial<ComputedCell> = {}) => ({
    metric_key: F12_JA,
    metric_version: 1,
    group: 'all',
    n: 4,
    numerator: 2,
    denominator: 4,
    missing: 0,
    ...over,
  });

  it('a leaders_all cell with a client (or a role group) → ReleaseRejected', async () => {
    await expect(
      privacy.release(ROUND, 'leaders_all', [leader({ client: 'kunde-a' })], store, AUTO),
    ).rejects.toThrow(ReleaseRejected);
    await expect(
      privacy.release(ROUND, 'leaders_all', [leader({ group: 'role:leiar' })], store, AUTO),
    ).rejects.toThrow(ReleaseRejected);
  });

  it('a round_client cell without a client → ReleaseRejected', async () => {
    await expect(privacy.release(ROUND, 'round_client', [leader()], store, AUTO)).rejects.toThrow(
      ReleaseRejected,
    );
  });

  it('an all_clients cell with a client field → ReleaseRejected (groups client:<slug> instead)', async () => {
    await expect(
      privacy.release(ROUND, 'all_clients', [cell('all', 6, 3)], store, AUTO),
    ).rejects.toThrow(ReleaseRejected);
    const ok = await privacy.release(
      ROUND,
      'all_clients',
      [leader({ group: 'client:kunde-a', n: 6 }), leader({ n: 6 })],
      store,
      AUTO,
    );
    expect(ok.released).toHaveLength(2);
  });

  it('responses_total in all_clients is suppressed by the general rules', async () => {
    const r = await privacy.release(
      ROUND,
      'all_clients',
      [leader({ metric_key: 'responses_total', n: 2, numerator: 2, denominator: 2 })],
      store,
      AUTO,
    );
    expect(r.released[0]).toMatchObject({ suppressed: true, n: 0 });
  });

  it('responses_total in round_client: group all exact, role groups by the general rules', async () => {
    const t = (group: string, n: number) => cell(group, n, n, { metric_key: 'responses_total' });
    const r = await privacy.release(
      ROUND,
      'round_client',
      [t('all', 2), t('role:sal', 2)],
      store,
      AUTO,
    );
    expect(find(r, 'all')).toMatchObject({ suppressed: false, n: 2 });
    expect(find(r, 'role:sal')).toMatchObject({ suppressed: true, n: 0 });
  });
});
