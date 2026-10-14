// Task 1.4c (integration): released snapshots in Postgres — trigger, one transaction for
// supersede + save + AuditLog, history of every release, metric set per round. Reads and writes
// of aggregate_snapshot in the test go through plain `pg` (lint 0.2b).
import 'reflect-metadata';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ComputedCell,
  PrivacyService,
  ReleaseRejected,
} from '../../src/modules/privacy/privacy.service.js';
import { PrismaResponseSource } from '../../src/modules/privacy/prisma-source.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { makeRound, type TestRound, withPg } from '../support/rounds.js';

const prisma = new PrismaService();
const MARK = `pss-${Date.now().toString(36)}`;
const CONFIG = { k: 3, exact_counts: ['responses_total'] };
const AUTO = { type: 'auto', who: 'system' } as const;
const F12 = 'tryggleik.f12_ja';
const F5 = 'tryggleik.f5_ja';
const B13 = 'tryggleik.b13';
let r: TestRound;
let slug: string;

const service = (db: PrismaService = prisma) =>
  new PrivacyService(db, new PrismaResponseSource(prisma), CONFIG);
const cell = (n: number, over: Partial<ComputedCell> = {}): ComputedCell => ({
  client: slug,
  metric_key: F12,
  metric_version: 1,
  group: 'all',
  n,
  numerator: n,
  denominator: n,
  missing: 0,
  ...over,
});

async function fresh(name: string): Promise<{ round: string; slug: string }> {
  const t = await makeRound(prisma, { mark: `${MARK}-${name}`, identification: 'initials' });
  return { round: t.round, slug: `${MARK}-${name}-kunde-a` };
}

const snapshots = (round: string) =>
  withPg((c) =>
    c.query<{ id: string; n: number; status: string; stale: boolean; population: string }>(
      'SELECT id, n, status, stale, population FROM aggregate_snapshot WHERE round_id = $1 ORDER BY status, n',
      [round],
    ),
  ).then((x) => x.rows);

beforeAll(async () => {
  r = await makeRound(prisma, { mark: MARK, identification: 'initials' });
  slug = `${MARK}-kunde-a`;
});

afterAll(() => prisma.$disconnect());

describe('Prisma snapshot store and atomic release (1.4c)', () => {
  it('release writes released rows and its AuditLog in one transaction', async () => {
    const res = await service().release(r.round, 'round_client', [cell(5)], 'db', AUTO);
    expect(res.released).toHaveLength(1);
    expect((await snapshots(r.round)).map((s) => [s.status, s.n])).toEqual([['released', 5]]);
    expect(
      await prisma.auditLog.count({
        where: { what: 'privacy.release.auto', target: `round:${r.round}` },
      }),
    ).toBe(1);
  });

  it('UPDATE numerator of a released row → trigger error; DELETE → trigger error', async () => {
    const [s] = await snapshots(r.round);
    await withPg(async (c) => {
      await expect(
        c.query('UPDATE aggregate_snapshot SET numerator = 99 WHERE id = $1', [s!.id]),
      ).rejects.toThrow(/aggregate_snapshot_released/);
      await expect(
        c.query('DELETE FROM aggregate_snapshot WHERE id = $1', [s!.id]),
      ).rejects.toThrow(/aggregate_snapshot_released/);
    });
  });

  it('released → superseded without a reason → error; with a reason → ok; superseded does not change', async () => {
    const t = await fresh('sup');
    slug = t.slug;
    await service().release(t.round, 'round_client', [cell(4)], 'db', AUTO);
    const [s] = await snapshots(t.round);
    await withPg(async (c) => {
      await expect(
        c.query("UPDATE aggregate_snapshot SET status = 'superseded' WHERE id = $1", [s!.id]),
      ).rejects.toThrow();
      await expect(
        c.query(
          "UPDATE aggregate_snapshot SET status = 'superseded', superseded_reason = 'x', n = 9 WHERE id = $1",
          [s!.id],
        ),
      ).rejects.toThrow(/aggregate_snapshot_released/);
      await c.query(
        "UPDATE aggregate_snapshot SET status = 'superseded', superseded_reason = 'test' WHERE id = $1",
        [s!.id],
      );
      await expect(
        c.query("UPDATE aggregate_snapshot SET superseded_reason = 'y' WHERE id = $1", [s!.id]),
      ).rejects.toThrow(/aggregate_snapshot_released/);
    });
    slug = `${MARK}-kunde-a`;
  });

  it('an AuditLog failure leaves no new snapshot and the previous one released', async () => {
    const t = await fresh('fail');
    slug = t.slug;
    await service().release(t.round, 'round_client', [cell(3)], 'db', AUTO);
    const failing = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop !== '$transaction') return Reflect.get(target, prop, receiver) as unknown;
        return (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, o: object) =>
          prisma.$transaction(
            (tx) =>
              fn(
                new Proxy(tx, {
                  get: (t2, p2, r2) =>
                    p2 === 'auditLog'
                      ? { create: () => Promise.reject(new Error('audit write failed')) }
                      : (Reflect.get(t2, p2, r2) as unknown),
                }),
              ),
            o,
          );
      },
    });
    await expect(
      service(failing).release(t.round, 'round_client', [cell(9)], 'db', AUTO),
    ).rejects.toThrow(/audit write failed/);
    expect((await snapshots(t.round)).map((s) => [s.status, s.n])).toEqual([['released', 3]]);
    slug = `${MARK}-kunde-a`;
  });

  it('history: A (n = 3) → B (n = 7) → after a deletion C (n = 4): C carries forward because of A', async () => {
    const t = await fresh('hist');
    slug = t.slug;
    await service().release(t.round, 'round_client', [cell(3)], 'db', AUTO);
    const b = await service().release(t.round, 'round_client', [cell(7)], 'db', AUTO);
    expect(b.released[0]).toMatchObject({ n: 7 });
    expect(b.released[0]?.stale).toBeUndefined();
    const c = await service().release(t.round, 'round_client', [cell(4)], 'db', AUTO);
    expect(c.released[0]).toMatchObject({ n: 7, stale: true });
    const d = await service().release(t.round, 'round_client', [cell(10)], 'db', AUTO);
    expect(d.released[0]).toMatchObject({ n: 10 });
    expect((await snapshots(t.round)).filter((s) => s.status === 'superseded')).toHaveLength(3);
    slug = `${MARK}-kunde-a`;
  });

  it('history: A=3 → B=7 → deletion C=6 carries forward because of B', async () => {
    const t = await fresh('hist-down');
    slug = t.slug;
    await service().release(t.round, 'round_client', [cell(3)], 'db', AUTO);
    await service().release(t.round, 'round_client', [cell(7)], 'db', AUTO);
    const c = await service().release(t.round, 'round_client', [cell(6)], 'db', AUTO);
    expect(c.released[0]).toMatchObject({ n: 7, stale: true });
    expect((await snapshots(t.round)).filter((s) => s.status === 'superseded')).toHaveLength(2);
    slug = `${MARK}-kunde-a`;
  });

  it('the metric set is fixed on the round: a metric outside it → ReleaseRejected in any population', async () => {
    const t = await fresh('set');
    slug = t.slug;
    await service().release(t.round, 'round_client', [cell(5)], 'db', AUTO, {
      metric_set: [`${F12}@1`, `${B13}@1`],
    });
    await expect(
      service().release(
        t.round,
        'all_clients',
        [cell(5, { metric_key: F5, client: undefined as never })],
        'db',
        AUTO,
      ),
    ).rejects.toThrow(ReleaseRejected);
    const leaders = await service().release(
      t.round,
      'leaders_all',
      [
        {
          metric_key: B13,
          metric_version: 1,
          group: 'all',
          n: 4,
          numerator: 2,
          denominator: 4,
          missing: 0,
        },
      ],
      'db',
      AUTO,
    );
    expect(leaders.released).toHaveLength(1);
    const set = await prisma.roundMetricSet.findUniqueOrThrow({ where: { round_id: t.round } });
    expect(set.metric_keys).toEqual([`${F12}@1`, `${B13}@1`]);
    slug = `${MARK}-kunde-a`;
  });

  it('a rejected release changes nothing (no metric set, no snapshot)', async () => {
    const t = await fresh('rej');
    slug = t.slug;
    await expect(
      service().release(t.round, 'round_client', [cell(5)], 'db', AUTO, {
        metric_set: [`${F5}@1`],
      }),
    ).rejects.toThrow(ReleaseRejected);
    expect(await snapshots(t.round)).toEqual([]);
    expect(await prisma.roundMetricSet.findUnique({ where: { round_id: t.round } })).toBeNull();
    slug = `${MARK}-kunde-a`;
  });
});
