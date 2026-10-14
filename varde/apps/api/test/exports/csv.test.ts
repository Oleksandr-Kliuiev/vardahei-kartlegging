import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { parseCsv } from '../support/csv.js';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { CsvService } from '../../src/modules/exports/csv.service.js';
import { cell } from '../../src/modules/exports/csv.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { withPg } from '../support/rounds.js';

let f: DashboardFixture;
beforeAll(async () => {
  f = await dashboardFixture();
}, 180_000);
afterAll(async () => {
  await f.close();
});
it('client CSV uses only common aggregates; hidden cells have no numbers', async () => {
  const r = await f.get(`/api/admin/exports/client.csv?round=${f.tryggleik}&client=daco`, f.cookie);
  expect(r.statusCode).toBe(200);
  expect(r.body).toMatch(/^\uFEFFSpørsmål;Svar;Måling;/);
  expect(r.body).not.toMatch(/respondent_key|submission_id|answers|\.leiar_/);
  const hidden = r.body.split('\r\n').filter((r) => /;;;;;$/.test(r));
  expect(hidden.length).toBeGreaterThan(0);
  expect(
    (await f.get(`/api/admin/exports/client.csv?round=${f.tryggleik}&client=alle`, f.cookie))
      .statusCode,
  ).toBe(400);
});
it('rows export requires a session', async () => {
  expect((await f.get(`/api/admin/exports/rows.csv?round=${f.ki}`)).statusCode).toBe(401);
});
it('client CSV contains exactly its round_client snapshot cells, never all_clients groups', async () => {
  const c = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
  const expected = await withPg(
    async (db) =>
      (
        await db.query<{
          metric_key: string;
          metric_version: number;
          group: string;
        }>(
          "SELECT metric_key,metric_version,\"group\" FROM aggregate_snapshot WHERE round_id=$1 AND client_id=$2 AND population='round_client' AND status='released'",
          [f.tryggleik, c.id],
        )
      ).rows,
  );
  const foreign = await withPg(
    async (db) =>
      (
        await db.query(
          "SELECT 1 FROM aggregate_snapshot WHERE round_id=$1 AND population='all_clients' AND \"group\" LIKE 'client:%' AND \"group\" <> 'client:daco' AND status='released'",
          [f.tryggleik],
        )
      ).rowCount,
  );
  expect(foreign).toBeGreaterThan(0);
  const response = await f.get(
    `/api/admin/exports/client.csv?round=${f.tryggleik}&client=daco`,
    f.cookie,
  );
  expect(response.statusCode).toBe(200);
  const [header, ...rows] = parseCsv(response.body);
  const columns = ['Måling', 'Versjon', 'Gruppe'].map((name) => header!.indexOf(name));
  expect(expected.length).toBeGreaterThan(0);
  expect(rows).toHaveLength(expected.length);
  expect(rows.map((row) => columns.map((i) => row[i]).join('|')).sort()).toEqual(
    expected.map((s) => `${s.metric_key}|${s.metric_version}|${s.group}`).sort(),
  );
  expect(rows.every((row) => !row[columns[2]!]!.startsWith('client:'))).toBe(true);
});
it('anonymous rows have submission IDs and no identifier column or leader answers', async () => {
  const text = await f.app.get(CsvService).rows(f.anon, undefined, f.session);
  const lines = text.trim().split('\r\n');
  expect(lines[0]).not.toMatch(/respondent_key|L[1-4]/);
  expect(lines.length).toBeGreaterThan(1);
  for (const r of lines.slice(1)) expect(r.split(';')[0]).toMatch(/^[a-f0-9-]{36}$/);
});
it('identified rows have source IDs and identifiers, common question columns only', async () => {
  const text = await f.app.get(CsvService).rows(f.tryggleik, 'daco', f.session);
  expect(text.split('\r\n')[0]).toContain('respondent_key;F2;');
  expect(text.split('\r\n')[0]).not.toMatch(/;B\d/);
  expect(text).toContain('source_id');
});
it('audit failure prevents the file from being returned', async () => {
  const real = f.prisma.$transaction.bind(f.prisma);
  const spy = vi.spyOn(f.prisma, '$transaction').mockImplementation((fn: unknown) =>
    real(async (tx) => {
      vi.spyOn(tx.auditLog, 'create').mockRejectedValue(new Error('synthetic audit failure'));
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    }),
  );
  try {
    await expect(f.app.get(CsvService).rows(f.ki, undefined, f.session)).rejects.toThrow(
      'synthetic audit failure',
    );
  } finally {
    spy.mockRestore();
  }
});
it('neutralises all formula prefixes and preserves quotes and line breaks', () => {
  for (const prefix of ['=', '+', '-', '@', '\t', '\r'])
    expect(cell(prefix + 'danger')).toContain("'");
  expect(cell('tekst;"\n')).toBe('"tekst;""\n"');
});

it('actual row CSV neutralises a formula supplied as a free text answer', async () => {
  const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
  const rc = await f.prisma.roundClient.findFirstOrThrow({
    where: { round_id: f.tryggleik, client_id: client.id },
  });
  const id = randomUUID();
  await f.prisma.$transaction((tx) =>
    f.app.get(PrivacyService).store.insertParts(tx, [
      {
        round_client_id: rc.id,
        part: 'common',
        role: 'kontor',
        lang: 'nn',
        respondent_key: 'ZZTEST',
        answers: { F22: '=1+1' },
        free: {},
        submission_id: id,
        content_hash: randomBytes(32).toString('hex'),
        source_id: null,
        duration_s: null,
        submitted_day: '2026-10-14',
      },
    ]),
  );
  const response = await f.get(
    `/api/admin/exports/rows.csv?round=${f.tryggleik}&client=daco`,
    f.cookie,
  );
  expect(response.statusCode).toBe(200);
  const [header, ...rows] = parseCsv(response.body);
  expect(rows.find((r) => r[0] === id)?.[header!.indexOf('F22')]).toBe("'=1+1");
});
