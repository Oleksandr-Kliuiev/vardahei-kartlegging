// 2.5 (integration): FindingRule versions and preview on a database of their own, so new versions
// never reach the parity tests. Closed rounds show the findings saved once per release; a new release
// is computed with the versions in effect; open rounds are live (orchestrator decision 16.10).
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AggregateView } from '../../src/modules/dashboard/aggregate-view.js';
import { LeaderView } from '../../src/modules/dashboard/leader-view.js';
import { FindingsService } from '../../src/modules/findings/findings.service.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { RoundsService } from '../../src/modules/rounds/rounds.service.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { cookieHeader } from '../support/auth-app.js';
import { insertResponse, withPg } from '../support/rounds.js';
import { SEED_DIR } from '../support/seed-dir.js';
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

type Rule = Record<string, unknown> & {
  key: string;
  version: number;
  options: string[];
  computed?: string;
  threshold: { medium: number; high: number };
};
interface Detail {
  rule: Rule;
  choices: { id: string }[];
  versions: { version: number; changed: string[] }[];
}
const call = (method: 'GET' | 'POST', url: string, payload?: object, auth = true) =>
  f.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: auth ? { cookie: cookieHeader(f.cookie) } : {},
    });
const detail = async (key: string) =>
  (await call('GET', `/api/admin/finding-rules/${key}`)).json<Detail>();
const draftOf = (rule: Rule) => {
  const rest: Partial<Rule> = { ...rule };
  delete rest.version;
  return rest;
};
const save = (key: string, rule: object, base?: number) =>
  call('POST', `/api/admin/finding-rules/${key}/versions`, {
    rule,
    ...(base ? { base_version: base } : {}),
  });
const preview = (key: string, body: object) =>
  call('POST', `/api/admin/finding-rules/${key}/preview`, body);
const versionsOf = (key: string) => f.prisma.findingRule.count({ where: { key } });
const audits = (what: string, target?: string) =>
  f.prisma.auditLog.count({ where: { what, ...(target ? { target } : {}) } });
const strip = (list: readonly object[]) =>
  list.map((f) => {
    const rest: Record<string, unknown> = { ...f };
    delete rest.latest_version;
    return rest;
  });

describe('2.5 versions over HTTP', () => {
  it('every endpoint needs an admin session', async () => {
    for (const [method, url] of [
      ['GET', '/api/admin/finding-rules?family=tryggleik&channel=aggregate'],
      ['GET', '/api/admin/finding-rules/tryggleik.f12'],
      ['POST', '/api/admin/finding-rules/tryggleik.f12/versions'],
      ['POST', '/api/admin/finding-rules/tryggleik.f12/preview'],
    ] as const)
      expect((await call(method, url, {}, false)).statusCode, url).toBe(401);
  });
  it('lists the latest version of each rule by template and channel', async () => {
    for (const [family, channel, n] of [
      ['tryggleik', 'aggregate', 15],
      ['tryggleik', 'leader', 10],
      ['ki', 'aggregate', 10],
      ['ki', 'leader', 4],
    ] as const) {
      const r = await call('GET', `/api/admin/finding-rules?family=${family}&channel=${channel}`);
      const list = r.json<{ key: string; version: number; versions: number }[]>();
      expect(list, `${family}/${channel}`).toHaveLength(n);
      expect(list.every((x) => x.version === 1 && x.versions === 1)).toBe(true);
    }
    const f12 = await detail('tryggleik.f12');
    expect(f12.choices.map((c) => c.id)).toEqual(['ja', 'delvis', 'nei', 'usikker']);
  });
  it('a change becomes version max + 1 with its AuditLog in the same transaction', async () => {
    const before = await detail('tryggleik.f9');
    const changed = {
      ...draftOf(before.rule),
      text: { nn: 'Syntetisk ny tekst', en: 'Synthetic new text' },
      threshold: { medium: 0.2, high: 0.35 },
    };
    const r = await save('tryggleik.f9', changed, 1);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ version: 2, rule: { threshold: { medium: 0.2 } } });
    const after = await detail('tryggleik.f9');
    expect(after.versions.map((v) => [v.version, v.changed])).toEqual([
      [2, ['text', 'threshold']],
      [1, []],
    ]);
    expect(await audits('findings.rule_version', 'finding_rule:tryggleik.f9')).toBe(1);
    // A failing AuditLog insert leaves no version behind.
    await withPg((c) =>
      c.query(`CREATE FUNCTION test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.what = 'findings.rule_version' THEN RAISE EXCEPTION 'synthetic'; END IF;
        RETURN NEW; END $$;
        CREATE TRIGGER test_fail_audit BEFORE INSERT ON audit_log
        FOR EACH ROW EXECUTE FUNCTION test_fail_audit();`),
    );
    try {
      const failed = await save('tryggleik.f9', { ...changed, min_count: 3 }, 2);
      expect(failed.statusCode).toBe(500);
    } finally {
      await withPg((c) =>
        c.query('DROP TRIGGER test_fail_audit ON audit_log; DROP FUNCTION test_fail_audit();'),
      );
    }
    expect(await versionsOf('tryggleik.f9')).toBe(2);
  });
  it('refuses changes of what the rule measures, bad thresholds and options, no-ops, stale bases', async () => {
    const { rule } = await detail('tryggleik.f5');
    const base = draftOf(rule);
    const cases: [object, RegExp][] = [
      [{ ...base, metric_key: 'tryggleik.f8.distribution' }, /metric_key/],
      [{ ...base, basis: 'tryggleik.f8.distribution' }, /basis/],
      [{ ...base, key: 'tryggleik.f6' }, /key/],
      [{ ...base, channel: 'leader' }, /channel/],
      [{ ...base, computed: 'routine' }, /computed/],
      [{ ...base, question: 'F5' }, /question/],
      [{ ...base, raw_options: ['nei'] }, /raw_options/],
      [{ ...base, threshold: { medium: 0.5, high: 0.4 } }, /Tersklane/],
      [{ ...base, threshold: { medium: 0.5, high: 1.5 } }, /Tersklane/],
      [{ ...base, options: ['kanskje'] }, /finst/],
      [{ ...base, options: [] }, /minst eitt/],
      [{ ...base, text: { nn: ' ', en: 'x' } }, /nynorsk og engelsk/],
      [{ ...base, version: 9 }, /Kontroller/],
      [base, /Ingen endringar/],
    ];
    for (const [body, text] of cases) {
      const r = await save('tryggleik.f5', body);
      expect(r.statusCode, r.body).toBe(400);
      expect(r.body).toMatch(text);
    }
    const leader = (await detail('tryggleik.leader_b13')).rule;
    expect(
      (await save('tryggleik.leader_b13', { ...draftOf(leader), options: ['nei'] })).body,
    ).toMatch(/ligg fast/);
    expect(await versionsOf('tryggleik.f5')).toBe(1);
    expect((await save('tryggleik.f5', { ...base, min_count: 3 }, 1)).statusCode).toBe(201);
    const stale = await save('tryggleik.f5', { ...base, min_count: 4 }, 1);
    expect(stale.statusCode).toBe(409);
    expect(stale.body).toMatch(/versjon 2/);
  });
  it('parallel saves get distinct versions; parallel saves from one base: exactly one wins', async () => {
    const { rule } = await detail('tryggleik.f6');
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        save('tryggleik.f6', {
          ...draftOf(rule),
          text: { nn: `Parallell ${i}`, en: `Parallel ${i}` },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(6).fill(201));
    expect(results.map((r) => r.json<{ version: number }>().version).sort()).toEqual([
      2, 3, 4, 5, 6, 7,
    ]);
    const latest = (await detail('tryggleik.f6')).rule;
    const same = await Promise.all(
      [0, 1, 2].map((i) =>
        save('tryggleik.f6', { ...draftOf(latest), text: { nn: `Same ${i}`, en: 'x' } }, 7),
      ),
    );
    expect(same.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    expect(await versionsOf('tryggleik.f6')).toBe(8);
    expect(await audits('findings.rule_version', 'finding_rule:tryggleik.f6')).toBe(8 - 1);
  });
});

let fired: Rule, changed: Rule, changedTal: string;
const taken = ['tryggleik.f5', 'tryggleik.f6', 'tryggleik.f9', 'tryggleik.f12'];
describe('2.5 closed rounds keep their saved findings (orchestrator 16.10)', () => {
  it('a new version changes neither the saved rows nor the closed dashboard; duplicates read the smallest version', async () => {
    const view = f.app.get(AggregateView);
    const before = await view.load(f.tryggleik);
    const daco = await view.load(f.tryggleik, 'daco');
    const rows = () =>
      f.prisma.finding.findMany({ where: { round_id: f.tryggleik }, orderBy: { id: 'asc' } });
    const rowsBefore = await rows();
    const list = await call('GET', '/api/admin/finding-rules?family=tryggleik&channel=aggregate');
    const shown = list
      .json<{ rule: Rule }[]>()
      .map((x) => x.rule)
      .filter((r) => !taken.includes(r.key) && before.findings.some((x) => x.key === r.key));
    [fired, changed] = shown as [Rule, Rule];
    expect(changed, 'two rules fire at «alle» in the fixture').toBeDefined();
    changedTal = before.findings.find((x) => x.key === changed.key)!.tal;
    // Version 2 of one would no longer fire, of the other would count the other answers.
    const others = (await detail(changed.key)).choices
      .map((c) => c.id)
      .filter((id) => !changed.options.includes(id));
    for (const [rule, change] of [
      [fired, { min_count: 999, text: { nn: 'Ny v2', en: 'New v2' } }],
      [changed, { threshold: { medium: 0, high: 0 }, min_count: 1, options: others }],
    ] as const)
      expect((await save(rule.key, { ...draftOf(rule), ...change }, 1)).statusCode).toBe(201);
    const after = await view.load(f.tryggleik);
    expect(strip(after.findings)).toEqual(strip(before.findings));
    expect(after.findings.find((x) => x.key === fired.key)).toMatchObject({
      version: 1,
      latest_version: 2,
    });
    expect(strip((await view.load(f.tryggleik, 'daco')).findings)).toEqual(strip(daco.findings));
    expect(await rows()).toEqual(rowsBefore);
    // History left a second row of the same rule and release: the smallest version is read.
    const row = rowsBefore.find((r) => r.rule_key === fired.key && r.client_id === null)!;
    await f.prisma.finding.create({
      data: {
        round_id: row.round_id,
        client_id: null,
        rule_key: row.rule_key,
        rule_version: 2,
        numbers: { n: 1, count: 1, share: 1, level: 'high' },
        release_id: row.release_id,
      },
    });
    expect(strip((await view.load(f.tryggleik)).findings)).toEqual(strip(before.findings));
  });
  it('a new release is computed with the versions in effect and saved once', async () => {
    await f.app.get(MetricsService).releaseRound(f.tryggleik, { type: 'manual', who: 'test:2.5' });
    const view = await f.app.get(AggregateView).load(f.tryggleik);
    expect(view.findings.find((x) => x.key === fired.key)).toBeUndefined();
    const now = view.findings.find((x) => x.key === changed.key);
    expect(now).toMatchObject({ version: 2 });
    expect(now?.tal).not.toBe(changedTal);
    const release = view.findings[0]!.release_id!;
    const saved = () =>
      f.prisma.finding.findMany({
        where: { round_id: f.tryggleik, release_id: release, client_id: null },
      });
    const rows = await saved();
    expect(new Set(rows.map((r) => r.rule_key)).size).toBe(rows.length);
    expect(rows.find((r) => r.rule_key === changed.key)?.rule_version).toBe(2);
    await f.app.get(AggregateView).load(f.tryggleik);
    expect(await saved()).toHaveLength(rows.length);
  });
});

describe('2.5 a closed round with only hidden cells', () => {
  it('still keeps the rule versions of its release, also for leader findings', async () => {
    const version = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'tryggleik' }, label: '2026-10-13' },
    });
    const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'gasta' } });
    const round = await f.prisma.round.create({
      data: {
        name: 'synthetic-2.5-hidden',
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
      for (const key of ['ZZH', 'ZZI'])
        await insertResponse(db, {
          round_client_id: rc.id,
          respondent_key: key,
          answers: { F12: 'nei' },
        });
      await insertResponse(db, {
        round_client_id: rc.id,
        part: 'leader',
        respondent_key: 'ZZH',
        answers: { B13: 'nei' },
      });
    });
    // Two answers: every common cell is hidden (k = 3), yet the release fixes its versions.
    await f.app.get(RoundsService).close(round.id, 'test:2.5');
    expect(await f.prisma.findingSet.count({ where: { round_id: round.id } })).toBe(2);
    const b13 = (await detail('tryggleik.leader_b13')).rule;
    const leader = () => f.app.get(LeaderView).client(round.id, client.slug, f.session);
    const shown = async () => (await leader()).findings.find((x) => x.key === b13.key);
    expect(await shown()).toMatchObject({ version: b13.version, level: 'medium' });
    const saved = await save(b13.key, { ...draftOf(b13), level: 'high' }, b13.version);
    expect(saved.statusCode).toBe(201);
    expect(await shown()).toMatchObject({ version: b13.version, level: 'medium' });
    const p = await preview(b13.key, { rule: draftOf(b13), round: round.id, client: 'alle' });
    expect(p.json()).toMatchObject({
      fixed_version: b13.version,
      current: { version: b13.version + 1 },
    });
  });
});

describe('2.5 preview on the input the dashboard reads', () => {
  it('aggregate: the current version equals the dashboard; a stricter draft keeps the numbers', async () => {
    const dash = await f.app.get(AggregateView).load(f.ki);
    const shown = dash.findings.find(
      (x) => !['ki.routine_hours', 'ki.heaviest_task'].includes(x.key),
    )!;
    const { rule } = await detail(shown.key);
    const counts = [await f.prisma.findingRule.count(), await f.prisma.finding.count()];
    const r = await preview(shown.key, { rule: draftOf(rule), round: f.ki, client: 'alle' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      source: 'released',
      fixed_version: 1,
      current: { version: 1, outcome: { kind: 'finding', tal: shown.tal, level: shown.level } },
    });
    const strict = await preview(shown.key, {
      rule: { ...draftOf(rule), threshold: { medium: 0.99, high: 1 } },
      round: f.ki,
      client: 'alle',
    });
    expect(strict.json()).toMatchObject({ draft: { outcome: { kind: 'none', tal: shown.tal } } });
    expect([await f.prisma.findingRule.count(), await f.prisma.finding.count()]).toEqual(counts);
    expect(
      (await preview('tryggleik.f12', { rule: {}, round: f.ki, client: 'alle' })).statusCode,
    ).toBe(400);
  });
  it('k = 3: fewer than three answers give no outcome; open rounds use the latest version', async () => {
    const version = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'tryggleik' }, label: '2026-10-13' },
    });
    const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
    const round = await f.prisma.round.create({
      data: {
        name: 'synthetic-2.5',
        type: 'regular',
        status: 'open',
        identification: 'initials',
        template_version_id: version.id,
      },
    });
    const rc = await f.prisma.roundClient.create({
      data: { round_id: round.id, client_id: client.id, status: 'open' },
    });
    const answer = (key: string) =>
      withPg((db) =>
        insertResponse(db, {
          round_client_id: rc.id,
          respondent_key: key,
          answers: { F12: 'nei' },
        }),
      );
    await answer('ZZA');
    await answer('ZZB');
    const { rule } = await detail('tryggleik.f12');
    for (const scope of ['daco', 'alle']) {
      const r = await preview('tryggleik.f12', {
        rule: draftOf(rule),
        round: round.id,
        client: scope,
      });
      expect(r.json()).toMatchObject({
        source: 'live',
        current: { outcome: { kind: 'hidden' } },
        draft: { outcome: { kind: 'hidden' } },
      });
      expect(JSON.stringify(r.json<{ current: unknown }>().current)).not.toMatch(/tal|share/);
    }
    await answer('ZZC');
    const three = await preview('tryggleik.f12', {
      rule: draftOf(rule),
      round: round.id,
      client: 'daco',
    });
    expect(three.json()).toMatchObject({
      current: { outcome: { kind: 'finding', tal: '3 av 3' } },
    });
    const text = { nn: 'Syntetisk open v2', en: 'Synthetic open v2' };
    expect((await save('tryggleik.f12', { ...draftOf(rule), text }, 1)).statusCode).toBe(201);
    const live = await f.app.get(AggregateView).load(round.id, 'daco');
    expect(live.findings.find((x) => x.key === 'tryggleik.f12')).toMatchObject({
      version: 2,
      text: text.nn,
    });
  });
  it('leader rules: audited leader read per client, leaders_all at «alle», audited reads for F12 × B13', async () => {
    const before = await audits('leader.read');
    const b13 = (await detail('tryggleik.leader_b13')).rule;
    const one = await preview(b13.key, { rule: draftOf(b13), round: f.tryggleik, client: 'daco' });
    expect(one.statusCode).toBe(200);
    expect(one.json()).toMatchObject({ audited: true, client: 'daco' });
    expect(one.body).not.toMatch(/answers|respondent_key|submission_id/);
    expect(await audits('leader.read')).toBe(before + 1);
    expect(await audits('leader.read', 'client:daco')).toBeGreaterThan(0);
    const all = await preview(b13.key, { rule: draftOf(b13), round: f.tryggleik, client: 'alle' });
    expect(all.json()).toMatchObject({ audited: false, client: null });
    expect(await audits('leader.read')).toBe(before + 1);
    const cross = (await detail('tryggleik.f12_x_b13')).rule;
    const clients = await f.prisma.roundClient.count({ where: { round_id: f.tryggleik } });
    const counted = await preview(cross.key, {
      rule: draftOf(cross),
      round: f.tryggleik,
      client: 'alle',
    });
    expect(counted.json()).toMatchObject({ audited: true });
    expect(counted.body).not.toMatch(/answers|respondent_key|Daco/);
    expect(await audits('leader.read')).toBe(before + 1 + clients);
  });
});

describe('2.5 seed and database guards', () => {
  it('seed works with newer versions in the database and keeps them latest', async () => {
    const findings = f.app.get(FindingsService);
    expect(await findings.seed(SEED_DIR)).toEqual({ created: 0, unchanged: 39 });
    const latest = await findings.rules('tryggleik', 'aggregate');
    expect(latest.find((r) => r.key === 'tryggleik.f6')?.version).toBe(8);
  });
  it('rule versions, findings and finding sets never change in the database', async () => {
    for (const [sql, error] of [
      [
        `UPDATE finding_rule SET channel = channel WHERE key = 'tryggleik.f12'`,
        /finding_rule_immutable/,
      ],
      [`DELETE FROM finding_rule WHERE key = 'tryggleik.f12'`, /finding_rule_immutable/],
      ['UPDATE finding SET numbers = numbers', /finding_immutable/],
      ['UPDATE finding_set SET rule_keys = rule_keys', /finding_immutable/],
      // Without its set the next dashboard read would compute the closed release again.
      ['DELETE FROM finding_set', /finding_immutable/],
    ] as const)
      await expect(withPg((c) => c.query(sql))).rejects.toThrow(error);
  });
});
