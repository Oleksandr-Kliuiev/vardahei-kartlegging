// Round archive (5.2) without a database: privacy reads snapshots for the archive without the
// numbers of hidden cells, and a restore refuses cells that release() would never publish.
import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  releasesOf,
  restorable,
  type ArchiveBody,
} from '../../src/modules/exports/round-archive.js';
import {
  type ArchiveRefs,
  ArchivedSnapshot,
  PrivacyService,
} from '../../src/modules/privacy/privacy.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { FixtureSource } from '../support/fixture-source.js';

const ROUND = '00000000-0000-4000-8000-000000000001';
const RC = '00000000-0000-4000-8000-0000000000a1';
const CLIENT = '00000000-0000-4000-8000-0000000000c1';
const R1 = '00000000-0000-4000-8000-0000000000f1';
const R2 = '00000000-0000-4000-8000-0000000000f2';
const CONFIG = { k: 3, exact_counts: ['responses_total'] };
// Metric names as constants: `key: '<dotted name>'` literals look like API keys to gitleaks.
const F12 = 't.f12.distribution';
const F13 = 't.f13.distribution';
const B13 = 't.leiar_b13.distribution';
const day = (d: string) => new Date(`${d}T00:00:00Z`);

const row = (over: Record<string, unknown>) => ({
  id: '00000000-0000-4000-8000-00000000aaa1',
  round_id: ROUND,
  population: 'round_client',
  round_client_id: RC,
  client_id: CLIENT,
  metric_key: F12 + '.ja',
  metric_version: 1,
  group: 'all',
  n: 5,
  numerator: 2,
  denominator: 5,
  missing: 0,
  suppressed: false,
  stale: false,
  status: 'released',
  computed_at: day('2026-10-14'),
  released_at: day('2026-10-14'),
  superseded_at: null,
  superseded_reason: null,
  release_id: R2,
  ...over,
});
const stored = [
  row({}),
  row({
    id: '00000000-0000-4000-8000-00000000aaa2',
    group: 'role:sal',
    suppressed: true,
    n: 0,
    numerator: 0,
    denominator: 0,
  }),
  row({
    id: '00000000-0000-4000-8000-00000000aaa3',
    status: 'superseded',
    superseded_at: new Date('2026-10-15T08:00:00Z'),
    superseded_reason: 'new release',
    release_id: R1,
  }),
];
const prisma = {
  aggregateSnapshot: { findMany: () => Promise.resolve(stored) },
} as unknown as PrismaService;
const privacy = new PrivacyService(prisma, new FixtureSource(), CONFIG);
const refs: ArchiveRefs = {
  roundClients: new Map([[RC, CLIENT]]),
  metrics: [
    { key: F12, version: 1, part: 'common' },
    { key: B13, version: 1, part: 'leader' },
    { key: 'responses_total', version: 1, part: 'common' },
  ],
};
function txWith(existing = 0) {
  const written: Prisma.AggregateSnapshotCreateManyInput[] = [];
  const tx = {
    aggregateSnapshot: {
      count: () => Promise.resolve(existing),
      createMany: ({ data }: { data: Prisma.AggregateSnapshotCreateManyInput[] }) => {
        written.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, written };
}

describe('archive snapshots (privacy)', () => {
  it('hidden cells leave without numbers; superseded keep their reason; restore writes them back', async () => {
    const archived = await privacy.archiveSnapshots(ROUND);
    expect(archived[0]).toMatchObject({
      n: 5,
      numerator: 2,
      status: 'released',
      computed_at: '2026-10-14',
    });
    expect(archived[1]).not.toHaveProperty('n');
    expect(archived[1]).not.toHaveProperty('numerator');
    expect(archived[2]).toMatchObject({
      status: 'superseded',
      superseded_reason: 'new release',
      superseded_at: '2026-10-15T08:00:00.000Z',
      release_id: R1,
    });
    const { tx, written } = txWith();
    expect(await privacy.restoreSnapshots(tx, ROUND, archived, refs)).toBe(3);
    expect(written.map((w) => [w.id, w.status, w.n, w.suppressed, w.release_id])).toEqual(
      stored.map((s) => [s.id, s.status, s.n, s.suppressed, s.release_id]),
    );
    expect(written[2]!.superseded_at).toEqual(new Date('2026-10-15T08:00:00Z'));
  });

  it('refuses what release() would never publish, before writing anything', async () => {
    const [visible] = await privacy.archiveSnapshots(ROUND);
    const cases: [unknown, RegExp][] = [
      [{ ...visible, suppressed: true }, /no numbers/],
      [{ ...visible, n: 2 }, /below k/],
      [{ ...visible, status: 'superseded' }, /reason/],
      [{ ...visible, superseded_reason: 'x' }, /reason/],
      [{ ...visible, population: 'leaders_all' }, /does not fit/],
      [{ ...visible, metric_key: F13 + '.ja' }, /no metric definition/],
      [{ ...visible, metric_key: B13 + '.nei' }, /does not fit/],
      [{ ...visible, client_id: '00000000-0000-4000-8000-0000000000c2' }, /unknown round client/],
      [{ ...visible, answers: { F12: 'nei' } }, /unrecognized|answers/i],
    ];
    for (const [cell, message] of cases) {
      const { tx, written } = txWith();
      await expect(privacy.restoreSnapshots(tx, ROUND, [cell], refs)).rejects.toThrow(message);
      expect(written).toEqual([]);
    }
    const exact = { ...visible, metric_key: 'responses_total', n: 1 };
    expect(ArchivedSnapshot.safeParse(exact).success).toBe(true);
    expect(await privacy.restoreSnapshots(txWith().tx, ROUND, [exact], refs)).toBe(1);
    await expect(privacy.restoreSnapshots(txWith(4).tx, ROUND, [visible], refs)).rejects.toThrow(
      /already has snapshots/,
    );
  });
});

describe('archive format', () => {
  it('release history comes from the snapshots; the restore comparison ignores derived parts', async () => {
    const archived = await privacy.archiveSnapshots(ROUND);
    expect(releasesOf(archived)).toEqual([
      expect.objectContaining({ release_id: R1, status: 'superseded', cells: 1, suppressed: 0 }),
      expect.objectContaining({ release_id: R2, status: 'released', cells: 2, suppressed: 1 }),
    ]);
    const body = {
      exported_at: '2026-10-16',
      releases: [],
      snapshots: archived,
    } as unknown as ArchiveBody;
    expect(restorable({ ...body, exported_at: '2027-01-01', releases: releasesOf(archived) })).toBe(
      restorable(body),
    );
    expect(restorable({ ...body, snapshots: archived.slice(1) })).not.toBe(restorable(body));
  });
});
