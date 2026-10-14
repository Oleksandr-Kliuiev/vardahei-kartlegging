import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AggregateView } from '../../src/modules/dashboard/aggregate-view.js';
import { RowsView } from '../../src/modules/dashboard/rows-view.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { PrismaResponseSource } from '../../src/modules/privacy/prisma-source.js';
import { withPg, insertResponse } from '../support/rounds.js';
import { dashboardFixture, type DashboardFixture } from './fixture.js';

let f: DashboardFixture;
const added: string[] = [];
beforeAll(async () => {
  f = await dashboardFixture();
}, 180_000);
afterAll(async () => {
  for (const id of added) {
    await withPg((db) =>
      db.query(
        'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id=$1)',
        [id],
      ),
    );
    await f.prisma.roundClient.deleteMany({ where: { round_id: id } });
    await f.prisma.round.delete({ where: { id } });
  }
  await f.close();
});
async function synthetic(mode: 'initials' | 'none' = 'initials') {
  const version = await f.prisma.templateVersion.findFirstOrThrow({
    where: {
      template: { key: mode === 'initials' ? 'tryggleik' : 'ki' },
      label: mode === 'initials' ? '2026-10-13' : '2026-10-12',
    },
  });
  const round = await f.prisma.round.create({
    data: {
      name: `synthetic-filter-${randomUUID()}`,
      type: 'regular',
      status: 'open',
      identification: mode,
      template_version_id: version.id,
    },
  });
  added.push(round.id);
  const rcs: Record<string, string> = {};
  for (const slug of ['daco', 'gasta', 'kviknes']) {
    const c = await f.prisma.client.findUniqueOrThrow({ where: { slug } });
    rcs[slug] = (
      await f.prisma.roundClient.create({
        data: { round_id: round.id, client_id: c.id, status: 'open' },
      })
    ).id;
  }
  return { id: round.id, rcs };
}
it('live role × client subtraction protects a 3+1 partition, and closing retains that protection', async () => {
  const r = await synthetic();
  await withPg(async (db) => {
    for (const [slug, roles] of [
      ['daco', ['kontor', 'kontor', 'kontor', 'sal', 'sal', 'sal']],
      ['gasta', ['kontor', 'sal', 'sal', 'sal']],
    ] as const)
      for (const role of roles)
        await insertResponse(db, {
          round_client_id: r.rcs[slug]!,
          role,
          respondent_key: 'ZZTEST',
          answers: { F2: role, F12: 'nei' },
        });
  });
  const view = f.app.get(AggregateView);
  const live = await view.load(r.id, undefined, 'kontor');
  expect(live.source).toBe('live');
  expect(live.zones!.n).toBe(4);
  expect(live.zones!.grid.find((c) => c.id === 'daco')!.mean).toBeNull(); // total 4 - visible 3 must not reveal 1
  expect((await view.load(r.id, 'daco', 'kontor')).zones!.n).toBe(3);
  expect((await view.load(r.id, 'kviknes')).zones!.n).toBeNull();
  expect(live.findings).toContainEqual(
    expect.objectContaining({ key: 'tryggleik.f12', count: 4, n: 4 }),
  );
  await f.prisma.round.update({
    where: { id: r.id },
    data: { status: 'closed', closed_at: new Date() },
  });
  await f.app.get(MetricsService).releaseRound(r.id, { type: 'auto', who: 'system' });
  const closed = await view.load(r.id, undefined, 'kontor');
  expect(closed.source).toBe('released');
  expect(closed.zones).toMatchObject(live.zones!);
  await withPg((db) =>
    db.query(
      'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id=$1)',
      [r.id],
    ),
  );
  expect((await view.load(r.id, undefined, 'kontor')).zones).toEqual(closed.zones);
});
it('quotes expose role only at k, omit identifiers in both modes, and never include leader free text', async () => {
  const r = await synthetic('none');
  await withPg(async (db) => {
    for (const [i, role] of ['kontor', 'kontor', 'kontor', 'it'].entries()) {
      const id = randomUUID();
      await insertResponse(db, {
        round_client_id: r.rcs.daco!,
        role,
        submission_id: id,
        answers: { K15: `Syntetisk sitat ${i}` },
      });
    }
    const id = randomUUID();
    await insertResponse(db, {
      round_client_id: r.rcs.daco!,
      role: 'kontor',
      part: 'leader',
      submission_id: id,
      answers: { L9: 'Syntetisk leiartekst' },
    });
  });
  const result = await f.app.get(RowsView).quotes(r.id, 'daco', f.session);
  expect(result.quotes).toHaveLength(4);
  expect(result.quotes.filter((q) => q.text !== 'Syntetisk sitat 3').every((q) => !!q.role)).toBe(
    true,
  );
  expect(result.quotes.find((q) => q.text === 'Syntetisk sitat 3')).not.toHaveProperty('role');
  expect(JSON.stringify(result)).not.toMatch(/respondent_key|leiartekst|answers/);
});
it('live HTTP dashboard hides n=2 cells and their n=3 complement, independently of FUNN min_count', async () => {
  const r = await synthetic();
  await withPg(async (db) => {
    for (const [slug, n] of [
      ['daco', 2],
      ['gasta', 3],
    ] as const)
      for (let i = 0; i < n; i++)
        await insertResponse(db, {
          round_client_id: r.rcs[slug]!,
          role: 'kontor',
          respondent_key: 'ZZTEST',
          answers: { F2: 'kontor', F12: 'nei' },
        });
  });
  const all = await f.get(`/api/admin/dashboard?round=${r.id}`, f.cookie);
  expect(all.statusCode).toBe(200);
  const model = all.json<Awaited<ReturnType<AggregateView['load']>>>();
  expect(model.source).toBe('live');
  expect(model.zones!.n).toBe(5);
  for (const id of ['daco', 'gasta']) {
    const cell = model.zones!.grid.find((c) => c.id === id)!;
    expect(cell).toMatchObject({ mean: null, critical: null });
    expect(cell.questions.every((q) => q.mean === null)).toBe(true);
  }
  const small = await f.get(`/api/admin/dashboard?round=${r.id}&client=daco`, f.cookie);
  expect(small.statusCode).toBe(200);
  const selected = small.json<Awaited<ReturnType<AggregateView['load']>>>();
  expect(selected.source).toBe('live');
  expect(selected.zones).toMatchObject({ n: null, mean: null, critical: null });
  expect(
    selected.questions
      .flatMap((q) => q.series.flatMap((s) => s.buckets))
      .every((b) => b.cell.suppressed && !('n' in b.cell) && !('numerator' in b.cell)),
  ).toBe(true);
});
it('an anonymous previous round is rejected inside privacy before either response read', async () => {
  const read = vi.spyOn(PrismaResponseSource.prototype, 'read');
  try {
    await expect(
      f.app.get(PrivacyService).employeeHistory({ round: f.tryggleik }, f.anon, f.session),
    ).rejects.toMatchObject({ status: 404 });
    expect(read).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
  }
});
it('quotes audit failure returns no rows and leaves no audit record', async () => {
  const before = await f.prisma.auditLog.count({ where: { what: 'privacy.rows' } }),
    real = f.prisma.$transaction.bind(f.prisma);
  const spy = vi.spyOn(f.prisma, '$transaction').mockImplementation((fn: unknown) =>
    real(async (tx) => {
      vi.spyOn(tx.auditLog, 'create').mockRejectedValue(new Error('synthetic quote audit failure'));
      return await (fn as (t: typeof tx) => Promise<unknown>)(tx);
    }),
  );
  try {
    await expect(f.app.get(RowsView).quotes(f.anon, undefined, f.session)).rejects.toThrow(
      'synthetic quote audit failure',
    );
  } finally {
    spy.mockRestore();
  }
  expect(await f.prisma.auditLog.count({ where: { what: 'privacy.rows' } })).toBe(before);
});

it('Soner counts common responses with no scored answer while keeping score statistics empty', async () => {
  const r = await synthetic();
  await withPg(async (db) => {
    for (const key of ['ZZA', 'ZZB', 'ZZC'])
      await insertResponse(db, {
        round_client_id: r.rcs.daco!,
        respondent_key: key,
        role: 'kontor',
        answers: { F2: 'kontor' },
      });
  });
  const v = await f.app.get(AggregateView).load(r.id, 'daco');
  expect(v.zones).toMatchObject({ n: 3, mean: null, critical: null, zone: null });
  expect(v.zones!.questions.every((q) => q.mean === null)).toBe(true);
});
