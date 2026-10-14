import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { parseCsv } from '../support/csv.js';
import { AnalyseService } from '../../src/modules/exports/analyse.service.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';

let f: DashboardFixture;
beforeAll(async () => {
  f = await dashboardFixture();
}, 180_000);
afterAll(async () => {
  await f.close();
});
const golden = () =>
  parseCsv(readFileSync(resolve('../../tools/parity/golden/analyse.csv'), 'utf8'));
it('identified tryggleik and KI details equal real old export without Del B', async () => {
  const expected = golden();
  const actual = [
    await f.app.get(AnalyseService).analyse(f.tryggleik, undefined, f.session),
    await f.app.get(AnalyseService).analyse(f.ki, undefined, f.session),
  ].map(parseCsv);
  expect(actual[0]![0]).toEqual(expected[0]);
  const sort = (rows: string[][]) => rows.map((r) => JSON.stringify(r)).sort();
  expect(sort(actual.flatMap((r) => r.slice(1)))).toEqual(
    sort(expected.slice(1).filter((r) => r[8] === 'A')),
  );
});
it('anonymous Master_Analyse is 404 and every export requires a session', async () => {
  expect((await f.get(`/api/admin/exports/analyse.csv?round=${f.anon}`, f.cookie)).statusCode).toBe(
    404,
  );
  for (const path of ['analyse.csv', 'analyse-personar.csv'])
    expect((await f.get(`/api/admin/exports/${path}?round=${f.tryggleik}`)).statusCode).toBe(401);
});
it('template filter does not accept a different template', async () => {
  expect(
    (await f.get(`/api/admin/exports/analyse.csv?round=${f.ki}&template=tryggleik`, f.cookie))
      .statusCode,
  ).toBe(404);
});
it('Master audit contains actor and row count, with no raw answers', async () => {
  await f.app.get(AnalyseService).analyse(f.ki, undefined, f.session);
  const a = await f.prisma.auditLog.findFirstOrThrow({
    where: { what: 'exports.master_analyse' },
    orderBy: { at: 'desc' },
  });
  expect(a.who).toBe('entra:test:dashboard-reader');
  expect((a.details as { count: number }).count).toBeGreaterThan(1);
  expect(JSON.stringify(a.details)).not.toMatch(/respondent_key|answers/);
});
it('audit failure produces no master CSV', async () => {
  const real = f.prisma.$transaction.bind(f.prisma);
  const spy = vi.spyOn(f.prisma, '$transaction').mockImplementation((fn: unknown) =>
    real(async (tx) => {
      vi.spyOn(tx.auditLog, 'create').mockRejectedValue(new Error('audit unavailable'));
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    }),
  );
  try {
    await expect(f.app.get(AnalyseService).analyse(f.ki, undefined, f.session)).rejects.toThrow(
      'audit unavailable',
    );
  } finally {
    spy.mockRestore();
  }
});
it('person export equals employee view and excludes KI', async () => {
  const data = parseCsv(await f.app.get(AnalyseService).people(f.tryggleik, f.session));
  expect(data[0]).toEqual([
    'Initialar',
    'Kunde',
    'Rolle',
    'Snittscore',
    'Sone',
    'Sone førre runde',
  ]);
  const g = JSON.parse(
    readFileSync(resolve('../../tools/parity/golden/tryggleik.alle.json'), 'utf8'),
  ) as { sections: { title: string; tables: string[][][] }[] };
  const table = g.sections.find((s) => s.title === 'Svar per tilsett')!.tables[0]!;
  expect(
    data
      .slice(1)
      .map((r) => r.slice(0, 5))
      .sort(),
  ).toEqual(
    table
      .slice(1)
      .map((r) => [r[0], r[2], r[1], r[3], r[4]])
      .sort(),
  );
  await expect(f.app.get(AnalyseService).people(f.ki, f.session)).rejects.toMatchObject({
    status: 404,
  });
});
