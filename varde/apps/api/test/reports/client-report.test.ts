// Task 5.1 (integration): the client report reads only released round_client snapshots and the
// saved aggregate findings of that release. Negative test on the identified synthetic fixture
// (initials in F1, leader parts, small groups, a client below k): no initials, respondent_key,
// rows, leader metrics or leader rules, and no numbers of hidden cells.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AggregateView } from '../../src/modules/dashboard/aggregate-view.js';
import { ComparisonView } from '../../src/modules/dashboard/comparison-view.js';
import { FindingRule } from '../../src/modules/findings/finding-rule.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import type { ClientReport } from '../../src/modules/reports/report.service.js';
import { RoundsService } from '../../src/modules/rounds/rounds.service.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { clients, fixtureText } from '../support/fixtures.js';
import { makeRound, withPg } from '../support/rounds.js';

let f: DashboardFixture;
const made: Awaited<ReturnType<typeof makeRound>>[] = [];
const initials = [
  ...new Set(
    fixtureText('svar.synthetic.jsonl')
      .trim()
      .split('\n')
      .flatMap((line) => {
        const r = JSON.parse(line) as { svar?: { F1?: string; K0?: string } };
        return [r.svar?.F1, r.svar?.K0].filter((s): s is string => !!s);
      }),
  ),
];
beforeAll(async () => {
  f = await dashboardFixture();
}, 180_000);
afterAll(async () => {
  for (const m of made) {
    const v = await f.prisma.templateVersion.findUniqueOrThrow({ where: { id: m.version } });
    await f.prisma.roundClient.deleteMany({ where: { round_id: m.round } });
    await f.prisma.round.delete({ where: { id: m.round } });
    const ids = Object.values(m.clients).map((c) => c.id);
    await f.prisma.client.deleteMany({ where: { id: { in: ids } } });
    await f.prisma.templateVersion.delete({ where: { id: m.version } });
    await f.prisma.surveyTemplate.delete({ where: { id: v.template_id } });
  }
  await f.prisma.auditLog.deleteMany({ where: { what: 'report.client' } });
  await f.close();
});

async function rcOf(round: string, slug: string) {
  const client = await f.prisma.client.findUniqueOrThrow({ where: { slug } });
  return f.prisma.roundClient.findFirstOrThrow({
    where: { round_id: round, client_id: client.id },
  });
}
async function report(round: string, slug: string, lang?: string) {
  const rc = await rcOf(round, slug);
  const r = await f.get(
    `/api/admin/round-clients/${rc.id}/report${lang ? `?lang=${lang}` : ''}`,
    f.cookie,
  );
  return { rc, status: r.statusCode, body: r.body, json: () => JSON.parse(r.body) as ClientReport };
}

describe('5.1 client report', () => {
  it('matches the released dashboard of the client: zone, respondents, top-3 findings, comparison', async () => {
    const { rc, status, json } = await report(f.tryggleik, 'daco');
    expect(status).toBe(200);
    const r = json();
    const dash = await f.app.get(AggregateView).load(f.tryggleik, 'daco');
    expect(r).toMatchObject({ class: 'aggregate', template: 'tryggleik', lang: 'nn' });
    expect(r.languages).toEqual(['nn', 'en']);
    expect(r.respondents).toBe(dash.zones!.n);
    expect(r.zone).toEqual({
      mean: dash.zones!.mean,
      critical: dash.zones!.critical,
      zone: dash.zones!.zone,
    });
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings.map((x) => x.key)).toEqual(dash.findings.slice(0, 3).map((x) => x.key));
    expect(r.findings.map((x) => x.tal)).toEqual(dash.findings.slice(0, 3).map((x) => x.tal));
    expect(r.questions.map((q) => [q.id, q.mean, q.zone])).toEqual(
      dash.zones!.questions.map((q) => [q.id, q.mean, q.zone]),
    );
    const cmp = (await f.app.get(ComparisonView).load(f.tryggleik, 'daco'))!;
    expect(r.comparison).toMatchObject({
      round: { name: 'Runde 1 (Forms, januar 2026)', type: 'external_import' },
      degree: 'comparable',
      before: { mean: cmp.total.before.mean, critical: cmp.total.before.critical },
      now: { mean: cmp.total.now.mean, critical: cmp.total.now.critical },
      change: { mean: cmp.total.change, critical: cmp.total.critical_change },
    });
    const audit = await f.prisma.auditLog.findFirstOrThrow({
      where: { what: 'report.client', target: `round_client:${rc.id}` },
      orderBy: { at: 'desc' },
    });
    expect(audit.who).toBe('test:dashboard-reader');
    expect(audit.details).toEqual({ round: f.tryggleik, client: rc.client_id, lang: 'nn' });
  });

  it('never carries initials, keys, rows, leader metrics or leader rules, in every language', async () => {
    const leader = await f.prisma.findingRule.findMany({ where: { channel: 'leader' } });
    // A leader Finding saved in the current release of every client (high, so it would lead
    // the list): only the channel filter of the report keeps it out.
    const cross = leader.find((r) => r.key.endsWith('f12_x_b13'))!;
    const defs = (await f.app.get(MetricsService).definitionsFor(f.tryggleik)).filter(
      (d) => d.part === 'common',
    );
    const planted: string[] = [];
    for (const c of clients()) {
      const cells = await f.app
        .get(PrivacyService)
        .viewCells(f.tryggleik, 'round_client', defs, c.slug, true);
      const release = cells.flatMap((x) => (x.suppressed ? [] : [x.release_id]))[0];
      if (!release) continue;
      const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: c.slug } });
      const row = await f.prisma.finding.create({
        data: {
          round_id: f.tryggleik,
          client_id: client.id,
          rule_key: cross.key,
          rule_version: cross.version,
          release_id: release,
          numbers: { n: 20, count: 20, share: 1, level: 'high' },
        },
      });
      planted.push(row.id);
    }
    expect(planted.length).toBeGreaterThan(3);
    const leaderTexts = leader.flatMap((r) => {
      const d = r.definition as {
        text: { nn: string; en: string };
        action_text: { nn: string; en: string };
      };
      return [r.key, d.text.nn, d.text.en, d.action_text.nn, d.action_text.en];
    });
    let checked = 0;
    try {
      for (const [round, lang] of [
        [f.tryggleik, 'nn'],
        [f.tryggleik, 'en'],
        [f.ki, 'nn'],
        [f.anon, 'en'],
      ] as const)
        for (const c of clients()) {
          const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: c.slug } });
          const member = await f.prisma.roundClient.count({
            where: { round_id: round, client_id: client.id },
          });
          if (member === 0) continue; // the anonymous KI round has no rows for every client
          const r = await report(round, c.slug, lang);
          expect(r.status, `${c.slug} ${lang}`).toBe(200);
          expect(r.body).not.toMatch(/"(answers|respondent_key|submission_id|free|rows)"\s*:/);
          expect(r.body).not.toMatch(/leaders_all|\.leiar_|leader_|f12_x_b13/);
          for (const key of initials) expect(r.body).not.toContain(key);
          for (const text of leaderTexts) expect(r.body).not.toContain(text);
          for (const finding of r.json().findings) expect(finding.key).not.toMatch(/leader|_x_/);
          checked++;
        }
    } finally {
      await f.prisma.finding.deleteMany({ where: { id: { in: planted } } });
    }
    expect(checked).toBeGreaterThan(12);
  });

  it('hidden cells keep no numbers; a client below k gets no numbers at all', async () => {
    const privacy = f.app.get(PrivacyService);
    const defs = (await f.app.get(MetricsService).definitionsFor(f.tryggleik)).filter(
      (d) => d.part === 'common',
    );
    let hidden = 0;
    for (const c of clients()) {
      const r = (await report(f.tryggleik, c.slug)).json();
      const cells = await privacy.viewCells(f.tryggleik, 'round_client', defs, c.slug, true);
      for (const q of r.questions) {
        const cell = cells.find(
          (x) => x.metric_key === `tryggleik.mean_score.${q.id}` && x.group === 'all',
        );
        if (cell && !cell.suppressed) continue;
        expect([q.mean, q.critical, q.zone], `${c.slug} ${q.id}`).toEqual([null, null, null]);
        hidden++;
      }
    }
    const small = (await report(f.tryggleik, 'tharaso')).json();
    expect(small.respondents).toBeNull();
    expect(small.zone).toEqual({ mean: null, critical: null, zone: null });
    expect(small.findings).toEqual([]);
    expect(small.comparison).toBeNull();
    expect(
      small.questions.every((q) => q.mean === null && q.critical === null && q.zone === null),
    ).toBe(true);
    expect(hidden).toBeGreaterThan(small.questions.length - 1);
  });

  it('a newer rule version (rule editor 2.5) never replaces the version in force at release', async () => {
    const before = (await report(f.tryggleik, 'daco')).json();
    const top = before.findings[0]!;
    const v1 = await f.prisma.findingRule.findUniqueOrThrow({
      where: { key_version: { key: top.key, version: 1 } },
    });
    const d1 = FindingRule.parse(v1.definition);
    const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
    const defs = await f.app.get(MetricsService).definitionsFor(f.tryggleik);
    const cells = await f.app.get(PrivacyService).viewCells(
      f.tryggleik,
      'round_client',
      defs.filter((d) => d.part === 'common'),
      'daco',
      true,
    );
    const release = cells.flatMap((c) => (c.suppressed ? [] : [c.release_id]))[0]!;
    // The row of v1 for the current release is what the report shows.
    await f.prisma.finding.findFirstOrThrow({
      where: { release_id: release, client_id: client.id, rule_key: top.key, rule_version: 1 },
    });
    const v2 = {
      ...d1,
      version: 2,
      text: { nn: 'tekst frå versjon to', en: 'text of version two' },
      action_text: { nn: 'tiltak frå versjon to', en: 'action of version two' },
    };
    await f.prisma.findingRule.create({
      data: { key: d1.key, version: 2, channel: 'aggregate', definition: v2 },
    });
    // The same release saved again under v2 with other numbers (as a dashboard read could).
    await f.prisma.finding.create({
      data: {
        round_id: f.tryggleik,
        client_id: client.id,
        rule_key: d1.key,
        rule_version: 2,
        release_id: release,
        numbers: { n: 99, count: 98, share: 0.99, level: 'high' },
      },
    });
    try {
      const after = (await report(f.tryggleik, 'daco')).json();
      expect(after.findings).toEqual(before.findings);
      expect(JSON.stringify(after)).not.toMatch(/versjon to|version two|98 av 99/);
    } finally {
      await f.prisma.finding.deleteMany({ where: { rule_key: d1.key, rule_version: 2 } });
      await f.prisma.findingRule.delete({ where: { key_version: { key: d1.key, version: 2 } } });
    }
  });

  it('language: English rule texts, bokmål only when the version has it', async () => {
    const en = (await report(f.tryggleik, 'daco', 'en')).json();
    const rules = await f.prisma.findingRule.findMany({
      where: { key: { in: en.findings.map((x) => x.key) } },
    });
    for (const x of en.findings) {
      const d = rules.find((r) => r.key === x.key)!.definition as { text: { en: string } };
      expect(x.text).toBe(d.text.en);
      expect(x.tal).toMatch(/^\d+ of \d+$/);
    }
    expect(en.questions[0]!.label).toMatch(/[A-Za-z]/);
    expect((await report(f.tryggleik, 'daco', 'nb')).status).toBe(400);
    expect((await report(f.tryggleik, 'daco', 'de')).status).toBe(400);
  });

  it('an open round gives no report, even with answers and released snapshots', async () => {
    const who = 'test:5.1-open';
    const rounds = f.app.get(RoundsService);
    const version = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'tryggleik' }, label: '2026-10-13', status: 'published' },
    });
    const mark = `rapport-open-${Date.now().toString(36)}`;
    const open = await rounds.create({ name: mark, template_version_id: version.id }, who);
    const client = await f.prisma.client.create({ data: { slug: mark, name: 'Syntetisk open' } });
    try {
      const rc = await rounds.addClient(
        open.id,
        { client_id: client.id, deadline: '2099-06-01' },
        who,
      );
      await rounds.openClient(rc.id, who);
      await f.prisma.$transaction((tx) =>
        f.app.get(PrivacyService).store.insertParts(
          tx,
          [0, 1, 2, 3, 4].map((i) => ({
            round_client_id: rc.id,
            part: 'common' as const,
            role: 'kontor',
            lang: 'nn' as const,
            respondent_key: `ZZOPEN${i}`,
            answers: { F2: 'kontor', F12: i < 3 ? 'nei' : 'ja', F14: 'nei', F5: 'ja' },
            free: {},
            submission_id: randomUUID(),
            content_hash: 'b'.repeat(64),
            source_id: null,
            duration_s: null,
            submitted_day: '2026-10-15',
          })),
        ),
      );
      // A manual release while the round is open: released cells exist, live cells exist.
      await rounds.release(open.id, who);
      const listed = (await f.get('/api/admin/rounds', f.cookie)).json<
        { id: string; round_clients: { id: string; released: boolean }[] }[]
      >();
      expect(listed.find((r) => r.id === open.id)?.round_clients[0]?.released).toBe(true);
      const r = await f.get(`/api/admin/round-clients/${rc.id}/report`, f.cookie);
      expect(r.statusCode).toBe(409);
      expect(r.json<{ message: string }>().message).toBe(
        'Rapporten kan lagast når runden er avslutta.',
      );
    } finally {
      await withPg((c) =>
        c.query(
          'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = $1)',
          [open.id],
        ),
      );
      await f.prisma.roundClient.deleteMany({ where: { round_id: open.id } });
      await f.prisma.round.delete({ where: { id: open.id } });
      await f.prisma.client.delete({ where: { id: client.id } });
      await f.prisma.auditLog.deleteMany({ where: { who } });
    }
  });

  it('only a closed round with released snapshots; admin session only', async () => {
    const empty = await makeRound(f.prisma, {
      mark: `rapport-tom-${Date.now()}`,
      identification: 'initials',
    });
    made.push(empty);
    const call = (rc: string, cookie = true) =>
      f.get(`/api/admin/round-clients/${rc}/report`, cookie ? f.cookie : undefined);
    const none = await call(empty.clients['kunde-a']!.roundClient);
    expect(none.statusCode).toBe(409);
    expect(none.body).toContain('ingen publiserte tal');
    expect((await call('00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    const daco = await rcOf(f.tryggleik, 'daco');
    expect((await call(daco.id, false)).statusCode).toBe(401);
    const rounds = (await f.get('/api/admin/rounds', f.cookie)).json<
      { id: string; round_clients: { id: string; released: boolean }[] }[]
    >();
    const flag = (round: string, rc: string) =>
      rounds.find((r) => r.id === round)?.round_clients.find((x) => x.id === rc)?.released;
    expect(flag(f.tryggleik, daco.id)).toBe(true);
    expect(flag(empty.round, empty.clients['kunde-a']!.roundClient)).toBe(false);
  });
});
