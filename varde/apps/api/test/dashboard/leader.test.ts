import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  LeaderView,
  type LeaderModel,
  type LeaderSummary,
} from '../../src/modules/dashboard/leader-view.js';
import { PrismaResponseSource } from '../../src/modules/privacy/prisma-source.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { golden, section, distributions, released } from '../support/golden.js';
import { clients } from '../support/fixtures.js';
import { dashboardFixture, type DashboardFixture } from './fixture.js';

let f: DashboardFixture, view: LeaderView;
beforeAll(async () => {
  f = await dashboardFixture();
  view = f.app.get(LeaderView);
}, 180_000);
afterAll(async () => {
  await f.close();
});
describe('1.27c leader channel', () => {
  it('both leader endpoints require an admin session', async () => {
    const c = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
    for (const url of [
      `/api/admin/clients/${c.id}/leader-answers?round=${f.tryggleik}`,
      `/api/admin/leader-answers?round=${f.tryggleik}`,
    ])
      expect((await f.get(url)).statusCode).toBe(401);
    await expect(
      f.app.get(PrivacyService).leaderAnswers({ round: f.tryggleik, client: 'daco' }, null),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('every client table equals golden, including free text and only leader questions', async () => {
    let count = 0;
    for (const [round, template] of [
      [f.tryggleik, 'tryggleik'],
      [f.ki, 'ki'],
    ] as const)
      for (const c of clients()) {
        const v = await view.client(round, c.slug, f.session);
        const g = section(golden(`${template}.${c.slug}.json`), 'Leiarane').tables[0];
        expect(v.columns.map((c) => c.label)).toEqual(
          g?.[0]?.slice(1) ?? v.columns.map((c) => c.label),
        );
        // §6.11: the import rejects the empty leader part (leader_empty).
        const expected = (g ?? [])
          .slice(1)
          .map((r) => r.slice(1))
          .filter((r) => r.some((v) => v !== '–'));
        if (c.slug === 'gasta' && template === 'tryggleik') {
          const manifest = await f.prisma.importManifest.findFirstOrThrow({
            where: { source: 'svar' },
            orderBy: { at: 'desc' },
          });
          expect(JSON.stringify(manifest.rejected)).toContain('leader_empty');
        }
        expect(v.table.map((r) => r.cells).sort(), c.slug).toEqual(expected.sort());
        for (const row of v.rows) {
          expect(row.submission_id).toMatch(/^[a-f0-9-]{36}$/);
          expect(
            Object.keys(row.answers).every((k) =>
              template === 'ki' ? k.startsWith('L') : k.startsWith('B'),
            ),
          ).toBe(true);
          expect(row).not.toHaveProperty('respondent_key');
          count++;
        }
      }
    expect(count).toBeGreaterThan(12);
  });
  it('all summary equals golden distributions, without client names (§6.2)', async () => {
    const result = await f.get(`/api/admin/leader-answers?round=${f.tryggleik}`, f.cookie);
    expect(result.statusCode).toBe(200);
    const summary = result.json<LeaderSummary>();
    const d = distributions(
      section(golden('tryggleik.alle.json'), 'Leiarane').lines,
      'tryggleik.2026-10-13',
      'leader',
    );
    let checked = 0;
    for (const q of summary.questions)
      for (const series of q.series)
        for (const b of series.buckets) {
          const g = d.get(q.id);
          if (!g || !g.counts.has(b.id)) continue;
          if (b.cell.suppressed) {
            expect(g.n).toBeLessThan(3);
            continue;
          }
          expect([b.cell.numerator, b.cell.denominator]).toEqual([g.counts.get(b.id), g.n]);
          checked++;
        }
    expect(checked).toBeGreaterThan(30);
    for (const c of clients()) expect(result.body).not.toContain(c.name);
    expect(result.body).not.toMatch(/submission_id|answers|respondent_key/);
  });
  it('HTTP only accepts one client and uses submission IDs, never common part', async () => {
    const c = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
    const r = await f.get(
      `/api/admin/clients/${c.id}/leader-answers?round=${f.tryggleik}`,
      f.cookie,
    );
    expect(r.statusCode).toBe(200);
    const v = r.json<LeaderModel>();
    expect(v.rows.length).toBeGreaterThan(0);
    expect(r.body).not.toMatch(/common|F12|respondent_key/);
    expect(
      (await f.get(`/api/admin/clients/alle/leader-answers?round=${f.tryggleik}`, f.cookie))
        .statusCode,
    ).toBe(400);
  });
  it('audit failure returns no data; reads and audit use the same transaction', async () => {
    const read = vi.spyOn(PrismaResponseSource.prototype, 'read');
    const real = f.prisma.$transaction.bind(f.prisma);
    const spy = vi.spyOn(f.prisma, '$transaction').mockImplementation((fn: unknown) =>
      real(async (tx) => {
        vi.spyOn(tx.auditLog, 'create').mockRejectedValue(new Error('synthetic audit failure'));
        try {
          return await (fn as (t: typeof tx) => Promise<unknown>)(tx);
        } finally {
          expect(read).toHaveBeenCalledOnce();
          expect(read.mock.calls.every(([, client]) => client === tx)).toBe(true);
        }
      }),
    );
    try {
      await expect(view.client(f.tryggleik, 'daco', f.session)).rejects.toThrow(
        'synthetic audit failure',
      );
    } finally {
      spy.mockRestore();
      read.mockRestore();
    }
  });
  it('audits contain actor/client/round/count and no answer values', async () => {
    const before = await f.prisma.auditLog.count({ where: { what: 'leader.read' } });
    const v = await view.client(f.ki, 'gasta', f.session);
    const audit = await f.prisma.auditLog.findFirstOrThrow({
      where: { what: 'leader.read' },
      orderBy: { at: 'desc' },
    });
    expect(await f.prisma.auditLog.count({ where: { what: 'leader.read' } })).toBe(before + 1);
    expect(audit).toMatchObject({
      who: 'entra:test:dashboard-reader',
      target: 'client:gasta',
      details: { round: f.ki, client: 'gasta', count: v.rows.length },
    });
    expect(JSON.stringify(audit.details)).not.toMatch(/answers|respondent_key/);
  });
  it('no leader cell is released in round_client or all_clients', async () => {
    for (const round of [f.tryggleik, f.ki])
      for (const s of (await released(round)).values()) {
        if (s.metric_key.includes('.leiar_')) expect(s.population).toBe('leaders_all');
        if (s.population === 'leaders_all') expect(s.group).toBe('all');
      }
  });
});
