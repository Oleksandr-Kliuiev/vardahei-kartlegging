import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ComparisonView } from '../../src/modules/dashboard/comparison-view.js';
import { change } from '../../src/modules/dashboard/round-pair.js';
import { golden, section, num } from '../support/golden.js';
import { dashboardFixture, type DashboardFixture } from './fixture.js';
import { withPg, insertResponse } from '../support/rounds.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { API_DIR } from '../support/prisma-cli.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let f: DashboardFixture, view: ComparisonView;
const added: string[] = [];
beforeAll(async () => {
  f = await dashboardFixture();
  view = f.app.get(ComparisonView);
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
const round = (n: number | null) => (n === null ? null : Number(n.toFixed(2)));
describe('1.29 snapshot comparison with Forms round 1', () => {
  it('per client, per question and total means/critical shares/change match golden (§6.1 suppressed cells)', async () => {
    const v = (await view.load(f.tryggleik))!;
    const g = section(golden('tryggleik.alle.json'), 'Samanlikning med runde 1');
    let checked = 0;
    for (const [data, table] of [
      [v.clients, g.tables[0]!],
      [[...v.questions, v.total], g.tables[1]!],
    ] as const)
      for (const r of data) {
        const row = table.slice(1).find((row) => row[0]!.startsWith(r.label))!;
        expect(row, r.label).toBeDefined();
        for (const [s, index, percentIndex] of [
          [r.before, 1, 4],
          [r.now, 2, 5],
        ] as const) {
          if (s.mean !== null) {
            expect(round(s.mean), r.label).toBe(num(row[index]!.split(' ')[0]!));
            checked++;
          }
          if (s.critical !== null)
            expect(Math.round(s.critical * 100), r.label).toBe(num(row[percentIndex]!));
        }
        if (r.change)
          expect(r.change.kind).toBe(
            row[3]!.includes('betre') ? 'betre' : row[3]!.includes('verre') ? 'verre' : 'likt',
          );
        if (r.critical_change)
          expect(r.critical_change.kind).toBe(
            row[6]!.includes('betre') ? 'betre' : row[6]!.includes('verre') ? 'verre' : 'likt',
          );
      }
    expect(checked).toBeGreaterThan(35);
  });
  it('single-client question/total figures = golden and comparability is the agreed full note', async () => {
    for (const slug of ['daco', 'gasta', 'kviknes', 'maskinsenteret', 'sfhs']) {
      const v = (await view.load(f.tryggleik, slug))!,
        g = section(golden(`tryggleik.${slug}.json`), 'Samanlikning med runde 1');
      for (const r of [...v.questions, v.total]) {
        const row = g.tables
          .at(-1)!
          .slice(1)
          .find((row) => row[0] === r.label)!;
        if (r.before.mean !== null)
          expect(round(r.before.mean), `${slug}/${r.id}`).toBe(num(row[1]!.split(' ')[0]!));
        if (r.now.mean !== null)
          expect(round(r.now.mean), `${slug}/${r.id}`).toBe(num(row[2]!.split(' ')[0]!));
      }
      const note = JSON.parse(
        readFileSync(
          join(API_DIR, '../../packages/schema/fixtures/metrics/comparability-f-anchors.v1.json'),
          'utf8',
        ),
      ) as { note: string };
      expect(v.note).toBe(note.note);
      expect(v.comparability[0]?.degree).toBe('comparable');
    }
    expect(await view.load(f.ki)).toBeNull();
  });
  it('cohort excludes customers not yet participating, without reading raw; no fallback to full historic population', async () => {
    const version = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'tryggleik' }, label: '2026-10-13' },
    });
    const round = await f.prisma.round.create({
      data: {
        name: 'synthetic-comparison-cohort',
        type: 'regular',
        status: 'open',
        identification: 'initials',
        template_version_id: version.id,
      },
    });
    added.push(round.id);
    for (const slug of ['daco', 'gasta']) {
      const client = await f.prisma.client.findUniqueOrThrow({ where: { slug } });
      const rc = await f.prisma.roundClient.create({
        data: { round_id: round.id, client_id: client.id, status: 'open' },
      });
      await withPg(async (db) => {
        for (const key of ['ZZA', 'ZZB', 'ZZC'])
          await insertResponse(db, {
            round_client_id: rc.id,
            respondent_key: key,
            answers: { F12: 'ja' },
          });
      });
    }
    await f.prisma.round.update({
      where: { id: round.id },
      data: { status: 'closed', closed_at: new Date() },
    });
    await f.app.get(MetricsService).releaseRound(round.id, { type: 'auto', who: 'system' });
    const v = (await view.load(round.id))!;
    expect(v.not_yet.sort()).toEqual(['Kviknes', 'Maskinsenteret', 'SFHS'].sort());
    const d = (await view.load(f.tryggleik, 'daco'))!,
      g = (await view.load(f.tryggleik, 'gasta'))!;
    expect(v.total.before.mean).not.toBe((await view.load(f.tryggleik))!.total.before.mean);
    const historical = await withPg((db) =>
      db.query<{ numerator: number; denominator: number }>(
        `SELECT numerator,denominator FROM aggregate_snapshot s JOIN client c ON c.id=s.client_id WHERE s.round_id=$1 AND s.population='round_client' AND s.status='released' AND s.metric_key='tryggleik.mean_score.all' AND s."group"='all' AND c.slug IN ('daco','gasta')`,
        [f.runde1],
      ),
    );
    expect(v.total.before.mean).toBe(
      historical.rows.reduce((s, r) => s + r.numerator, 0) /
        historical.rows.reduce((s, r) => s + r.denominator, 0),
    );
    expect(v.questions.find((q) => q.id === 'F12')!.before.mean).toBeGreaterThanOrEqual(
      Math.min(
        d.questions.find((q) => q.id === 'F12')!.before.mean!,
        g.questions.find((q) => q.id === 'F12')!.before.mean!,
      ),
    );
    await withPg((db) =>
      db.query(
        'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id=ANY($1::uuid[]))',
        [[f.runde1, round.id]],
      ),
    );
    expect(await view.load(round.id)).toEqual(v);
  });
  it('HTTP requires session, never returns rows; changes use ±0.05 and percentage points', async () => {
    const url = `/api/admin/dashboard/comparison?round=${f.tryggleik}`;
    expect((await f.get(url)).statusCode).toBe(401);
    const r = await f.get(url, f.cookie);
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toMatch(/answers|respondent_key|leader/);
    expect(change(1, 1.049)?.kind).toBe('likt');
    expect(change(1, 1.051)?.kind).toBe('verre');
    expect(change(1, 0.949)?.kind).toBe('betre');
    expect(change(0.1, 0.15, true)).toEqual({ delta: 5, kind: 'verre' });
    expect(change(0.1, 0.104, true)?.kind).toBe('likt');
    expect(change(null, 1)).toBeNull();
  });
});
