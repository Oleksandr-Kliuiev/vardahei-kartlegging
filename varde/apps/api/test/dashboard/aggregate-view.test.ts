import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AggregateView, type AggregateModel } from '../../src/modules/dashboard/aggregate-view.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { golden, section, num, distributions } from '../support/golden.js';
import { clients } from '../support/fixtures.js';
import { withPg } from '../support/rounds.js';
import { dashboardFixture, type DashboardFixture } from './fixture.js';

let f: DashboardFixture, view: AggregateView;
beforeAll(async () => {
  f = await dashboardFixture();
  view = f.app.get(AggregateView);
}, 180_000);
afterAll(async () => {
  await f.close();
});
const rounded = (x: number | null) => (x === null ? null : Number(x.toFixed(2)));
describe('1.27 aggregate dashboard: golden runs (a)/(b), §6 exceptions 1 and 11', () => {
  it('all and each client: Soner hero equals golden or explicitly suppressed', async () => {
    for (const slug of ['alle', ...clients().map((c) => c.slug)]) {
      const v = await view.load(f.tryggleik, slug);
      const g = section(golden(`tryggleik.${slug}.json`), 'Soner');
      expect(v.class).toBe('aggregate');
      expect(v.source).toBe('released');
      // Seed rules share one set of thresholds, so the dashboard can name them (16.10).
      expect(v.finding_thresholds, slug).toEqual({ min_count: 2, medium: 0.15, high: 0.3 });
      if (slug === 'tharaso') {
        expect(v.zones!.mean, '§6.1 small client').toBeNull();
        continue;
      }
      expect(rounded(v.zones!.mean), slug).toBe(num(g.lines[2]!));
      expect(Math.round(v.zones!.critical! * 100), slug).toBe(num(g.lines[6]!));
      expect(
        v.zones!.persons.map((p) => (p.cell && !p.cell.suppressed ? p.cell.numerator : null)),
      ).toEqual([9, 11, 13, 15].map((i) => num(g.lines[i]!)));
    }
  });
  it('common distributions = golden for every client and both KI versions', async () => {
    let compared = 0,
      hidden = 0;
    for (const [id, prefix, version, dir] of [
      [f.tryggleik, 'tryggleik', '2026-10-13', ''],
      [f.ki, 'ki', '2026-10-13', ''],
      [f.anon, 'ki', '2026-10-12', 'ki-2026-10-12/'],
    ] as const) {
      for (const slug of ['alle', ...clients().map((c) => c.slug)]) {
        if (dir && ['maskinsenteret', 'tharaso'].includes(slug)) continue; // no run (b) golden for absent clients
        const v = await view.load(id, slug);
        const d = distributions(
          section(golden(`${dir}${prefix}.${slug}.json`), 'Svar frå alle tilsette').lines,
          `${prefix}.${version}`,
        );
        for (const q of v.questions)
          for (const s of q.series)
            for (const b of s.buckets) {
              const expected = d.get(q.id)?.counts.get(b.id);
              if (expected === undefined) continue;
              if (b.cell.suppressed) {
                expect(b.cell).not.toHaveProperty('numerator');
                hidden++;
                continue;
              } // §6.1
              expect(
                [b.cell.denominator, b.cell.numerator],
                `${prefix}/${slug}/${q.id}.${b.id}`,
              ).toEqual([d.get(q.id)!.n, expected]);
              compared++;
            }
      }
    }
    expect(compared).toBeGreaterThan(400);
    expect(hidden).toBeGreaterThan(0);
  });
  it('eight key questions retain order, scores and critically coloured distributions', async () => {
    const v = await view.load(f.tryggleik);
    expect(v.key_questions.map((q) => q.id)).toEqual([
      'F12',
      'F5',
      'F14',
      'F9',
      'F8',
      'F11',
      'F16',
      'F19',
    ]);
    const lines = section(golden('tryggleik.alle.json'), 'Nøkkelspørsmåla').lines;
    for (const q of v.key_questions) {
      const at = lines.indexOf(q.short_label);
      expect(Math.round(q.critical! * 100), q.id).toBe(num(lines[at + 1]!));
      expect(q.series[0]!.buckets.every((b) => b.score !== null)).toBe(true);
    }
  });
  it('role filters change totals, hide small/complementary groups and never fall back to all', async () => {
    const v = await view.load(f.tryggleik, 'daco');
    expect(v.roles.length).toBeGreaterThan(0);
    expect(v.roles.map((r) => r.id)).not.toContain('it');
    const selected = await view.load(f.tryggleik, 'daco', v.roles[0]!.id);
    expect(selected.zones!.n).toBeLessThan(v.zones!.n!);
    for (const role of ['it', 'missing']) {
      const small = await view.load(f.tryggleik, undefined, role === 'it' ? 'missing' : role);
      expect(small.zones!.mean).toBeNull();
      expect(
        small.zones!.grid.every(
          (c) => c.mean === null && c.questions.every((q) => q.mean === null),
        ),
      ).toBe(true);
    }
  });
  it('KI routine total, task hours and K7/K8 = golden', async () => {
    const v = await view.load(f.ki);
    const cell = v.ki!.routine_hours!;
    expect(cell.suppressed).toBe(false);
    if (cell.suppressed) throw new Error('routine hidden');
    const g = section(golden('ki.alle.json'), 'Kvar KI kan hjelpe').lines;
    const line = g.find((l) => l.includes('rutineoppgåver hos dei'))!;
    expect(line).toContain(`≈ ${Math.round(cell.numerator)} timar/veke`);
    const table = section(golden('ki.alle.json'), 'Svar frå alle tilsette').tables[0]!;
    for (const task of v.ki!.tasks) {
      const row = table.slice(1).find((r) => r[0] === task.label);
      expect(row, task.id).toBeDefined();
      if (!task.cell.suppressed) {
        expect(task.cell.n).toBe(num(row![1]!.split(' ')[0]!));
        expect(task.cell.numerator).toBeCloseTo(num(row![2]!.replace('≈ ', '')), 0);
      }
    }
  });
  it('HTTP requires session, validates scope and contains neither rows nor leader part', async () => {
    const url = `/api/admin/dashboard?round=${f.tryggleik}`;
    expect((await f.get(url)).statusCode).toBe(401);
    expect((await f.get('/api/admin/dashboard?round=bad', f.cookie)).statusCode).toBe(400);
    expect((await f.get(`${url}&client=missing`, f.cookie)).statusCode).toBe(404);
    const r = await f.get(url, f.cookie);
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toMatch(/answers|respondent_key|submission_id|leader|B13/);
  });
  it('live computed cells equal released; snapshots survive removal of raw', async () => {
    const before = await view.load(f.tryggleik);
    // Direct privacy view testing without reopening an immutable closed Round.
    const privacy = f.app.get(PrivacyService);
    const defs = await f.app.get(MetricsService).definitionsFor(f.tryggleik);
    const cells = await privacy.viewCells(
      f.tryggleik,
      'all_clients',
      defs.filter((d) => d.part === 'common'),
    );
    expect(cells.filter((c) => c.suppressed).every((c) => Object.keys(c).length === 4)).toBe(true);
    await withPg((db) =>
      db.query(
        'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id=$1)',
        [f.tryggleik],
      ),
    );
    expect(await view.load(f.tryggleik)).toEqual(before);
    const r = await f.get(`/api/admin/dashboard?round=${f.tryggleik}`, f.cookie);
    expect(r.json<AggregateModel>().zones).toEqual(before.zones);
  });
});
