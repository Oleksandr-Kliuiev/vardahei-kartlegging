// 2.5 (integration): the backfill of migration 20261016100000 on a database of its own. Closed
// rounds hold saved Findings and finding sets; the migration is taken back (down.sql), every rule
// gets a version 2 with another text, and the migration runs again. The sets come back the same
// (the smallest saved version, else the smallest version of the key), none names a version 2, and
// the dashboards of the closed rounds do not change.
import 'reflect-metadata';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AggregateView } from '../../src/modules/dashboard/aggregate-view.js';
import { LeaderView } from '../../src/modules/dashboard/leader-view.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { startApp, type TestApp } from '../support/auth-app.js';
import { API_DIR, databaseUrl, prisma } from '../support/prisma-cli.js';
import { withPg } from '../support/rounds.js';
import { temporaryDatabase } from '../support/test-database.js';

const MIGRATION = join(API_DIR, 'prisma', 'migrations', '20261016100000_finding_rule_versions');
let dispose: (() => Promise<void>) | undefined;
let f: DashboardFixture | undefined;
let after: TestApp | undefined;
beforeAll(async () => {
  dispose = await temporaryDatabase();
  f = await dashboardFixture();
}, 240_000);
afterAll(async () => {
  await after?.app.close();
  await f?.app.close();
  await dispose?.();
});

const sets = () =>
  withPg(
    async (c) =>
      (
        await c.query<{ release_id: string; scope: string; rule_keys: string[] }>(
          'SELECT release_id, scope, rule_keys FROM finding_set ORDER BY release_id, scope',
        )
      ).rows,
  );
function run(file: string) {
  const url = databaseUrl();
  const r = prisma(['db', 'execute', '--url', url, '--file', join(MIGRATION, file)], url);
  expect(r.status, r.output).toBe(0);
}
/** The findings of a view without the hint «a newer version exists», which may change. */
function shown(view: unknown) {
  if (typeof view !== 'object' || view === null || !('findings' in view)) return view;
  const v = view as { findings: Record<string, unknown>[] };
  return {
    ...v,
    findings: v.findings.map((x) => {
      const rest = { ...x };
      delete rest.latest_version;
      return rest;
    }),
  };
}

describe('2.5 migration backfill of finding sets', () => {
  it('takes the smallest version, never a newer one; dashboards stay the same', async () => {
    const fx = f!;
    const rounds = [fx.tryggleik, fx.ki, fx.anon, fx.runde1];
    const read = async (app: TestApp['app']) => {
      const out: unknown[] = [];
      for (const round of rounds)
        for (const client of [undefined, 'daco', 'gasta'])
          out.push(
            shown(
              await app
                .get(AggregateView)
                .load(round, client)
                .catch(() => 'no client'),
            ),
          );
      for (const round of [fx.tryggleik, fx.ki])
        out.push((await app.get(LeaderView).summary(round, fx.session)).findings);
      return out;
    };
    const before = await read(fx.app);
    const kept = await sets();
    expect(kept.length).toBeGreaterThan(rounds.length);
    await fx.app.close();
    f = undefined;

    run('down.sql');
    // Every rule gets a version 2 with another text, as the editor would leave them.
    await withPg((c) =>
      c.query(`INSERT INTO finding_rule (key, version, channel, definition)
        SELECT key, 2, channel,
          jsonb_set(jsonb_set(definition, '{version}', '2'), '{text,nn}', '"tekst frå versjon 2"')
        FROM finding_rule WHERE version = 1`),
    );
    run('migration.sql');

    const again = await sets();
    expect(again).toEqual(kept);
    expect(again.flatMap((x) => x.rule_keys).filter((k) => k.endsWith('@2'))).toEqual([]);
    after = await startApp({});
    expect(await read(after.app)).toEqual(before);
    expect(JSON.stringify(await read(after.app))).not.toContain('tekst frå versjon 2');
  });
});
