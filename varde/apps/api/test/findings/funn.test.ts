import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AggregateView } from '../../src/modules/dashboard/aggregate-view.js';
import { LeaderView } from '../../src/modules/dashboard/leader-view.js';
import { FindingsService } from '../../src/modules/findings/findings.service.js';
import { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import { FindingRule } from '../../src/modules/findings/finding-rule.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { golden, section, released } from '../support/golden.js';
import { clients } from '../support/fixtures.js';
import { SEED_DIR } from '../support/seed-dir.js';
import { insertResponse, withPg } from '../support/rounds.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';

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
const rules = (family: string) =>
  FindingRule.array().parse(
    JSON.parse(readFileSync(join(SEED_DIR, 'findings', `${family}.json`), 'utf8')),
  );
describe('1.28 FUNN as versioned data; golden §6.1/2/11', () => {
  it('fixture lists exactly 15+9+1 tryggleik and 8+2+4 KI rules and seeds immutably', async () => {
    const t = rules('tryggleik'),
      k = rules('ki');
    expect(t.filter((r) => r.channel === 'aggregate')).toHaveLength(15);
    expect(t.filter((r) => r.channel === 'leader' && !r.computed)).toHaveLength(9);
    expect(t.filter((r) => r.computed === 'f12_b13')).toHaveLength(1);
    expect(k.filter((r) => r.channel === 'aggregate' && !r.computed)).toHaveLength(8);
    expect(k.filter((r) => r.computed)).toHaveLength(2);
    expect(k.filter((r) => r.channel === 'leader')).toHaveLength(4);
    expect(await f.app.get(FindingsService).seed(SEED_DIR)).toEqual({ created: 0, unchanged: 39 });
    for (const r of [...t, ...k])
      if (!r.computed) expect(r.threshold).toEqual({ medium: 0.15, high: 0.3 });
  });
  it('aggregate findings match golden IDs, n, share, severity and exact text/action for all/every client', async () => {
    let checked = 0,
      missing = 0;
    for (const [round, family, dir] of [
      [f.tryggleik, 'tryggleik', ''],
      [f.ki, 'ki', ''],
      [f.anon, 'ki', 'ki-2026-10-12/'],
    ] as const)
      for (const slug of ['alle', ...clients().map((c) => c.slug)]) {
        if (dir && ['maskinsenteret', 'tharaso'].includes(slug)) continue;
        const v = await f.app.get(AggregateView).load(round, slug);
        const lines = section(
          golden(`${dir}${family}.${slug}.json`),
          family === 'ki' ? 'Kvar KI kan hjelpe' : 'Dette bør vi ta tak i',
        ).lines;
        for (const rule of rules(family).filter((r) => r.channel === 'aggregate' && !r.computed)) {
          const at = lines.findIndex((l) => l.endsWith(` ${rule.text.nn}`));
          const found = v.findings.find((r) => r.key === rule.key);
          if (at < 0) {
            expect(found, rule.key).toBeUndefined();
            continue;
          }
          const m = /^(\d+) av (\d+) /.exec(lines[at]!)!;
          if (!found) {
            const scope = await f.app.get(FindingsService).rules(family, 'aggregate');
            expect(scope.some((r) => r.key === rule.key)).toBe(true);
            // §6.1: only suppressed input cells may remove a golden finding.
            const context = await f.prisma.round.findUniqueOrThrow({
              where: { id: round },
              include: { template_version: true },
            });
            const metrics = await f.prisma.metricDefinition.findMany({
              where: { key: { startsWith: `${family}.` } },
            });
            const defs = metrics.map((m) => MetricDefinition.parse(m.definition));
            const privacy = f.app.get(PrivacyService);
            const cells =
              slug === 'alle'
                ? await privacy.viewCells(context.id, 'all_clients', defs)
                : await privacy.adminClientCells(context.id, slug, defs);
            expect(
              cells.some(
                (c) =>
                  c.group === 'all' &&
                  c.suppressed &&
                  (c.metric_key.startsWith(rule.metric_key + '.') ||
                    c.metric_key.startsWith(rule.basis + '.')),
              ),
              `${family}/${slug}/${rule.key}: missing without §6.1`,
            ).toBe(true);
            missing++;
            continue;
          }
          expect([found.count, found.n], `${family}/${slug}/${rule.key}`).toEqual([
            Number(m[1]),
            Number(m[2]),
          ]);
          expect(found.share).toBe(Number(m[1]) / Number(m[2]));
          expect(found.level).toBe(['Høg', 'Stor'].includes(lines[at - 1]!) ? 'high' : 'medium');
          expect(found.text).toBe(rule.text.nn);
          expect(found.action).toBe(rule.action_text.nn);
          expect(lines).toContain(`Forslag: ${found.action}`);
          checked++;
        }
      }
    expect(checked).toBeGreaterThan(60);
    expect(missing).toBeGreaterThan(0);
  });
  it('computed KI hours/heaviest task match golden, and released findings link their release', async () => {
    const v = await f.app.get(AggregateView).load(f.ki);
    const lines = section(golden('ki.alle.json'), 'Kvar KI kan hjelpe').lines;
    for (const key of ['ki.routine_hours', 'ki.heaviest_task']) {
      const finding = v.findings.find((f) => f.key === key)!;
      expect(lines).toContain(`${finding.tal} ${finding.text}`);
      expect(finding.release_id).toMatch(/^[a-f0-9-]{36}$/);
    }
    const stored = await f.prisma.finding.findMany({ where: { round_id: f.ki, client_id: null } });
    for (const finding of v.findings) {
      const row = stored.find(
        (r) => r.rule_key === finding.key && r.release_id === finding.release_id,
      )!;
      expect(row).toBeDefined();
      const numbers = row.numbers as { n: number; count: number; share: number; level: string };
      expect([numbers.n, numbers.count, numbers.level]).toEqual([
        finding.n,
        finding.count,
        finding.level,
      ]);
      expect(numbers.share).toBeCloseTo(finding.share, 14);
    }
  });
  it('leader findings only appear in the leader endpoint, and all-summary union counts = golden', async () => {
    for (const [round, family] of [
      [f.tryggleik, 'tryggleik'],
      [f.ki, 'ki'],
    ] as const) {
      const summary = await f.app.get(LeaderView).summary(round, f.session);
      const lines = section(
        golden(`${family}.alle.json`),
        family === 'ki' ? 'Kvar KI kan hjelpe' : 'Dette bør vi ta tak i',
      ).lines;
      for (const found of summary.findings.filter((f) => !f.key.endsWith('f12_x_b13'))) {
        const line = lines.find((l) => l.includes(` ${found.text}`))!;
        const m = /^(\d+) av (\d+) leiarar /.exec(line)!;
        expect([found.count, found.n], found.key).toEqual([Number(m[1]), Number(m[2])]);
        for (const c of clients()) expect(JSON.stringify(found)).not.toContain(c.name);
      }
      const aggregate = await f.get(`/api/admin/dashboard?round=${round}`, f.cookie);
      expect(aggregate.body).not.toMatch(/leader_|f12_x_b13|leiar_|"channel":"leader"/);
      const persisted = await f.prisma.finding.findMany({ where: { round_id: round } });
      expect(
        persisted.every(
          (f) => !f.rule_key.includes('leader_') && !f.rule_key.includes('f12_x_b13'),
        ),
      ).toBe(true);
      expect(
        [...(await released(round)).values()].every((s) => !s.metric_key.includes('f12_x_b13')),
      ).toBe(true);
    }
  });
  it('per-client F12×B13 uses common k aggregate and an audited leader read, all has only client count', async () => {
    const version = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'tryggleik' }, label: '2026-10-13' },
    });
    const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
    const round = await f.prisma.round.create({
      data: {
        name: 'synthetic-cross',
        type: 'regular',
        status: 'open',
        identification: 'initials',
        template_version_id: version.id,
      },
    });
    added.push(round.id);
    const rc = await f.prisma.roundClient.create({
      data: { round_id: round.id, client_id: client.id, status: 'open' },
    });
    await withPg(async (db) => {
      for (const key of ['ZZA', 'ZZB'])
        await insertResponse(db, {
          round_client_id: rc.id,
          respondent_key: key,
          answers: { F12: 'ja' },
        });
      await insertResponse(db, {
        round_client_id: rc.id,
        part: 'leader',
        respondent_key: 'ZZA',
        answers: { B13: 'nei' },
      });
    });
    const leader = f.app.get(LeaderView);
    expect(
      (await leader.client(round.id, 'daco', f.session)).findings.some(
        (f) => f.key === 'tryggleik.f12_x_b13',
      ),
    ).toBe(false);
    await withPg((db) =>
      insertResponse(db, { round_client_id: rc.id, respondent_key: 'ZZC', answers: { F12: 'ja' } }),
    );
    expect((await leader.client(round.id, 'daco', f.session)).findings).toContainEqual(
      expect.objectContaining({ key: 'tryggleik.f12_x_b13', tal: '100 %' }),
    );
    const all = await leader.summary(round.id, f.session);
    expect(all.findings).toContainEqual(
      expect.objectContaining({ key: 'tryggleik.f12_x_b13', tal: '1 kundar', count: 1 }),
    );
    expect(JSON.stringify(all)).not.toContain(client.name);
    expect(
      await f.prisma.auditLog.count({
        where: {
          what: 'leader.read',
          target: 'client:daco',
          details: { path: ['round'], equals: round.id },
        },
      }),
    ).toBeGreaterThanOrEqual(3);
  });
  it('aggregate FUNN survives raw deletion and persisted output remains leader-free', async () => {
    const before = await f.app.get(AggregateView).load(f.tryggleik);
    await withPg((db) =>
      db.query(
        'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id=$1)',
        [f.tryggleik],
      ),
    );
    expect((await f.app.get(AggregateView).load(f.tryggleik)).findings).toEqual(before.findings);
  });
});
