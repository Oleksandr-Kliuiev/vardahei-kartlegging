// 2.5 × 5.1 (integration, on a database of its own: rule versions are never deleted). The client
// report reads the Findings saved for the release: a round closed just now has them before anyone
// opens the dashboard, and a newer rule version never replaces the version in force at release.
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import type { ClientReport } from '../../src/modules/reports/report.service.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { RoundsService } from '../../src/modules/rounds/rounds.service.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { cookieHeader } from '../support/auth-app.js';
import { insertResponse, withPg } from '../support/rounds.js';
import { temporaryDatabase } from '../support/test-database.js';

let dispose: (() => Promise<void>) | undefined;
let f: DashboardFixture;
beforeAll(async () => {
  dispose = await temporaryDatabase();
  f = await dashboardFixture();
}, 240_000);
afterAll(async () => {
  await f?.close();
  await dispose?.();
});

async function report(round: string, slug: string) {
  const client = await f.prisma.client.findUniqueOrThrow({ where: { slug } });
  const rc = await f.prisma.roundClient.findFirstOrThrow({
    where: { round_id: round, client_id: client.id },
  });
  const r = await f.get(`/api/admin/round-clients/${rc.id}/report`, f.cookie);
  expect(r.statusCode, r.body).toBe(200);
  return r.json<ClientReport>();
}

describe('2.5 × 5.1 client report and rule versions', () => {
  it('a round closed just now has its findings in the report before anyone opens the dashboard', async () => {
    const version = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'tryggleik' }, label: '2026-10-13' },
    });
    const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'kviknes' } });
    const round = await f.prisma.round.create({
      data: {
        name: 'synthetic-2.5-report',
        type: 'regular',
        status: 'open',
        identification: 'initials',
        template_version_id: version.id,
      },
    });
    const rc = await f.prisma.roundClient.create({
      data: { round_id: round.id, client_id: client.id, status: 'open' },
    });
    await withPg(async (db) => {
      for (const key of ['ZZR1', 'ZZR2', 'ZZR3', 'ZZR4'])
        await insertResponse(db, {
          round_client_id: rc.id,
          respondent_key: key,
          answers: { F2: 'kontor', F12: 'nei' },
        });
    });
    // Closing releases the round; nothing here reads the dashboard.
    await f.app.get(RoundsService).close(round.id, 'test:2.5');
    const saved = await f.prisma.finding.findMany({
      where: { round_id: round.id, client_id: client.id },
    });
    expect(saved.map((x) => x.rule_key)).toContain('tryggleik.f12');
    const shown = await report(round.id, 'kviknes');
    expect(shown.findings.map((x) => x.key)).toContain('tryggleik.f12');
    expect(shown.findings.find((x) => x.key === 'tryggleik.f12')).toMatchObject({ tal: '4 av 4' });
  });

  it('a newer rule version never replaces the version in force at release', async () => {
    const before = await report(f.tryggleik, 'daco');
    const top = before.findings[0]!;
    const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
    const defs = await f.app.get(MetricsService).definitionsFor(f.tryggleik);
    const cells = await f.app.get(PrivacyService).ownCells(
      f.tryggleik,
      'daco',
      defs.filter((d) => d.part === 'common'),
    );
    const release = cells.flatMap((c) => (c.suppressed ? [] : [c.release_id]))[0]!;
    // The row of version 1 for the current release is what the report shows.
    await f.prisma.finding.findFirstOrThrow({
      where: { release_id: release, client_id: client.id, rule_key: top.key, rule_version: 1 },
    });
    const detail = await f.app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/admin/finding-rules/${top.key}`,
        headers: { cookie: cookieHeader(f.cookie) },
      });
    const rule = detail.json<{ rule: Record<string, unknown> }>().rule;
    delete rule.version;
    const saved = await f.app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: `/api/admin/finding-rules/${top.key}/versions`,
        headers: { cookie: cookieHeader(f.cookie) },
        payload: {
          base_version: 1,
          rule: {
            ...rule,
            text: { nn: 'tekst frå versjon to', en: 'text of version two' },
            action_text: { nn: 'tiltak frå versjon to', en: 'action of version two' },
          },
        },
      });
    expect(saved.statusCode, saved.body).toBe(201);
    // History may hold a second row of the same release under the newer version.
    await f.prisma.finding.create({
      data: {
        round_id: f.tryggleik,
        client_id: client.id,
        rule_key: top.key,
        rule_version: 2,
        release_id: release,
        numbers: { n: 99, count: 98, share: 0.99, level: 'high' },
      },
    });
    const after = await report(f.tryggleik, 'daco');
    expect(after.findings).toEqual(before.findings);
    expect(JSON.stringify(after)).not.toMatch(/versjon to|version two|98 av 99/);
  });
});
