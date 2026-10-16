// Task 5.2 (integration): archive of a closed round → empty migrated database → restore "as
// snapshots". A synthetic identified round of its own (initials, free text, leader parts, a
// client below k; auto release at close plus a manual release, so superseded rows with reasons)
// keeps the archive small whatever else the test database holds. Snapshots, definitions,
// rules, Findings and finding sets are canonically the same after restore, the dashboard and the
// client report equal the original and reading them adds no Finding, a repeated restore is a
// no-op and a changed archive is refused without writing anything. An archive written before 2.5
// (no finding sets) restores with the sets the 2.5 migration would make. Rule versions are never
// deleted (2.5), so refusals that need a rule in the database run in databases of their own.
// Negative test: no respondent_key, initials, answers or free text in the archive.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { archiveCommand } from '../../src/cli/archive.js';
import {
  type ArchiveBody,
  archiveHash,
  derivedSets,
  restorable,
  RoundArchive,
  setsOf,
} from '../../src/modules/exports/round-archive.js';
import { RoundArchiveService } from '../../src/modules/exports/round-archive.service.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { type ResponsePart, PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { RoundsService } from '../../src/modules/rounds/rounds.service.js';
import { canonical } from '../../src/modules/surveys/hashes.js';
import { SeedTemplatesService } from '../../src/modules/surveys/seed-templates.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { startApp, type TestApp } from '../support/auth-app.js';
import { captureOutput } from '../support/capture-output.js';
import { withPg } from '../support/rounds.js';
import { SEED_DIR } from '../support/seed-dir.js';
import { temporaryDatabase } from '../support/test-database.js';

const MARK = `arkiv-${Date.now().toString(36)}`;
const WHO = 'test:5.2';
const SECRETS = ['ZZARK', 'Syntetisk fritekst ZZFRI', 'Syntetisk leiarsvar ZZLEIAR'];
const dir = mkdtempSync(join(tmpdir(), 'varde-arkiv-'));
let t: TestApp;
let round: string;
let cookie: Record<string, string>;
let archive: RoundArchive;
let body: string;
const clientIds: string[] = [];

/** People per client: a (4 kontor + 2 sal), b (4 kontor), c (2: below k). */
const PEOPLE: [string, number][] = [
  ['a', 6],
  ['b', 4],
  ['c', 2],
];
function parts(rc: string, client: string, count: number): ResponsePart[] {
  const part = (i: number, kind: 'common' | 'leader', answers: Record<string, unknown>) => ({
    round_client_id: rc,
    part: kind,
    role: kind === 'common' ? (i < 4 ? 'kontor' : 'sal') : null,
    lang: 'nn' as const,
    respondent_key: `ZZARK${client.toUpperCase()}${i}`,
    answers,
    free: {},
    submission_id: randomUUID(),
    content_hash: 'a'.repeat(64),
    source_id: null,
    duration_s: null,
    submitted_day: '2026-10-14',
  });
  const out: ResponsePart[] = [];
  for (let i = 0; i < count; i++)
    out.push(
      part(i, 'common', {
        F2: i < 4 ? 'kontor' : 'sal',
        F3: i % 2 ? 'delvis' : 'ja',
        F5: i < 2 ? 'nei' : 'ja',
        F9: i < 3 ? 'nei' : 'ja',
        F12: i === 0 ? 'usikker' : 'ja',
        F14: i < 3 ? 'nei' : 'ja',
        F20: 'Syntetisk fritekst ZZFRI',
      }),
    );
  out.push(part(0, 'leader', { B3: 'Syntetisk leiarsvar ZZLEIAR', B12: 'nei', B13: 'nei' }));
  return out;
}

beforeAll(async () => {
  t = await startApp({});
  const prisma = t.app.get(PrismaService);
  await t.app.get(SeedTemplatesService).seedTemplates(SEED_DIR, WHO);
  await t.app.get(MetricsService).seedMetrics(SEED_DIR);
  const version = await prisma.templateVersion.findFirstOrThrow({
    where: { template: { key: 'tryggleik' }, label: '2026-10-13', status: 'published' },
  });
  const rounds = t.app.get(RoundsService);
  round = (await rounds.create({ name: MARK, template_version_id: version.id }, WHO)).id;
  for (const [name, count] of PEOPLE) {
    const client = await prisma.client.create({
      data: { slug: `${MARK}-${name}`, name: `Syntetisk ${name}` },
    });
    clientIds.push(client.id);
    const rc = await rounds.addClient(round, { client_id: client.id, deadline: '2099-06-01' }, WHO);
    await rounds.openClient(rc.id, WHO);
    await prisma.$transaction((tx) =>
      t.app.get(PrivacyService).store.insertParts(tx, parts(rc.id, name, count)),
    );
  }
  await rounds.close(round, WHO);
  await t.app.get(MetricsService).releaseRound(round, { type: 'manual', who: WHO });
  const session = await t.store.create({
    oid: WHO,
    name: 'Syntetisk admin',
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  cookie = { varde_session: t.app.getHttpAdapter().getInstance().signCookie(session.sid) };
}, 180_000);

afterAll(async () => {
  const prisma = t.app.get(PrismaService);
  await withPg((c) =>
    c.query(
      'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = $1)',
      [round],
    ),
  );
  await prisma.roundClient.deleteMany({ where: { round_id: round } });
  await prisma.round.delete({ where: { id: round } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.auditLog.deleteMany({ where: { who: WHO } });
  await t.app.close();
  rmSync(dir, { recursive: true, force: true });
});

async function cli(file: string, ...extra: string[]) {
  const out = captureOutput();
  try {
    await archiveCommand(['restore', '--file', file, ...extra]);
    return JSON.parse(out.lines().at(-1) ?? '{}') as { outcome: string; snapshots: number };
  } finally {
    out.restore();
  }
}
function save(name: string, a: unknown) {
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(a));
  return file;
}
/** A changed archive with a correct hash: only the checks of restore can refuse it. */
function resealed(change: (a: ArchiveBody) => void): RoundArchive {
  const copy: Partial<RoundArchive> = structuredClone(archive);
  delete copy.sha256;
  change(copy as ArchiveBody);
  return { ...(copy as ArchiveBody), sha256: archiveHash(copy as ArchiveBody) };
}
const dashboards = () => ['', `&client=${MARK}-a`, `&client=${MARK}-c`];
/** Dashboards and client reports of the round, as an app sees them. */
async function views(app: TestApp, c: Record<string, string>) {
  const out: unknown[] = [];
  for (const q of dashboards()) {
    const r = await app.get(`/api/admin/dashboard?round=${round}${q}`, c);
    expect(r.statusCode, q).toBe(200);
    out.push(JSON.parse(r.body));
  }
  for (const rc of archive.round_clients) {
    const r = await app.get(`/api/admin/round-clients/${rc.id}/report`, c);
    expect(r.statusCode, rc.id).toBe(200);
    const shown = r.json<Record<string, unknown>>();
    delete shown.generated; // the day of the reading
    out.push(shown);
  }
  return out;
}
async function adminOf(app: TestApp) {
  const session = await app.store.create({
    oid: WHO,
    name: 'Syntetisk admin',
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return { varde_session: app.app.getHttpAdapter().getInstance().signCookie(session.sid) };
}
/** A refusal that needs a rule in the database, in a fresh database of its own: rule versions
 * are never deleted (2.5). */
async function refusedWithRule(
  rule: { key: string; version: number; channel: string; definition: unknown },
  file: string,
  message: RegExp,
) {
  const dispose = await temporaryDatabase();
  try {
    await withPg((c) =>
      c.query(
        'INSERT INTO finding_rule (key, version, channel, definition) VALUES ($1, $2, $3, $4)',
        [rule.key, rule.version, rule.channel, JSON.stringify(rule.definition)],
      ),
    );
    await expect(cli(file)).rejects.toThrow(message);
  } finally {
    await dispose();
  }
}

describe('5.2 round archive', () => {
  it('export: aggregates and definitions of one closed round with a sha256, audited', async () => {
    const r = await t.get(`/api/admin/exports/archive.json?round=${round}`, cookie);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toBe(
      `attachment; filename="varde-arkiv-${round}.json"`,
    );
    body = r.body;
    archive = RoundArchive.parse(JSON.parse(body));
    const { sha256, ...rest } = archive;
    expect(archiveHash(rest)).toBe(sha256);
    expect(archive.snapshots.some((s) => s.status === 'released')).toBe(true);
    expect(
      archive.snapshots.some((s) => s.status === 'superseded' && s.superseded_reason !== null),
    ).toBe(true);
    expect(archive.releases).toHaveLength(6); // three populations, two releases
    expect(archive.findings.length).toBeGreaterThan(0);
    // 2.5: the rule versions of every current release and scope travel with the round.
    expect(derivedSets(archive)).toEqual([]);
    expect(archive.finding_sets!.length).toBeGreaterThanOrEqual(PEOPLE.length + 1);
    expect(archive.clients.map((c) => c.slug)).toEqual(PEOPLE.map(([n]) => `${MARK}-${n}`));
    expect(archive.metric_definitions.some((d) => d.key === 'tryggleik.zone')).toBe(true);
    const audit = await t.app.get(PrismaService).auditLog.findFirstOrThrow({
      where: { what: 'exports.archive', target: `round:${round}` },
    });
    expect(audit.details).toMatchObject({ sha256, snapshots: archive.snapshots.length });
    expect((await t.get(`/api/admin/exports/archive.json?round=${round}`)).statusCode).toBe(401);
  });

  it('negative: no respondent_key, initials, answers, free text or link codes in the archive', () => {
    expect(body).not.toMatch(
      /"(answers|respondent_key|submission_id|free|code|code_hash|legacy_code_hash|source_id)"\s*:/,
    );
    for (const secret of SECRETS) expect(body).not.toContain(secret);
    const hidden = archive.snapshots.filter((s) => s.suppressed);
    expect(hidden.length).toBeGreaterThan(0);
    for (const s of hidden) expect(s).not.toHaveProperty('n');
    // The client below k has no visible cell of its own.
    const c = archive.clients.find((x) => x.slug === `${MARK}-c`)!;
    expect(archive.snapshots.filter((s) => s.client_id === c.id && !s.suppressed)).toEqual([]);
  });

  it('restore into an empty database: canonically the same, same dashboard and report, then a no-op', async () => {
    const before = await views(t, cookie);
    const dispose = await temporaryDatabase();
    let copy: TestApp | undefined;
    try {
      copy = await startApp({});
      const prisma = copy.app.get(PrismaService);
      const file = save('arkiv.json', archive);
      // Refused archives write nothing: the empty database stays empty.
      const changed = structuredClone(archive);
      changed.snapshots[0]!.metric_version += 1;
      await expect(cli(save('tampered.json', changed))).rejects.toThrow(/sha256/);
      const visible = archive.snapshots.findIndex(
        (s) => !s.suppressed && s.population === 'all_clients',
      );
      const small = resealed((a) => {
        a.snapshots[visible] = { ...a.snapshots[visible]!, n: 2 };
      });
      await expect(cli(save('small.json', small))).rejects.toThrow(/below k/);
      const smuggled = resealed((a) => {
        (a.snapshots[visible] as Record<string, unknown>).answers = { F12: 'nei' };
      });
      await expect(cli(save('smuggled.json', smuggled))).rejects.toThrow(/not a round archive/);
      const leader = resealed((a) => {
        const i = a.snapshots.findIndex((s) => s.population === 'leaders_all');
        a.snapshots[i] = { ...a.snapshots[i]!, population: 'all_clients' };
      });
      await expect(cli(save('leader.json', leader))).rejects.toThrow(/does not fit/);
      // Findings must follow from the archive: aggregate rule, release of the same round and
      // scope, n ≥ k and the numbers evaluate() gives on that release's cells.
      const a = archive.clients.find((c) => c.slug === `${MARK}-a`)!.id;
      const own = archive.findings.find((x) => x.client_id === a)!;
      const leaderRule = archive.finding_rules.find((x) => x.channel === 'leader')!;
      const allRelease = archive.snapshots.find((x) => x.population === 'all_clients')!.release_id;
      const finding = (change: (f: RoundArchive['findings'][number]) => void) =>
        resealed((x) => change(x.findings.find((f) => f.id === own.id)!));
      for (const [name, bad, message] of [
        [
          'leader-finding',
          resealed((x) => {
            x.findings.push({
              ...own,
              id: randomUUID(),
              rule_key: leaderRule.key,
              rule_version: leaderRule.version,
            });
          }),
          /not an aggregate rule/,
        ],
        [
          'small-finding',
          finding((f) => {
            f.numbers = { ...f.numbers, n: 2, share: f.numbers.count / 2 };
          }),
          /n below k/,
        ],
        [
          'other-n',
          finding((f) => {
            f.numbers = { ...f.numbers, n: f.numbers.n + 1 };
          }),
          /do not follow from the archived cells/,
        ],
        [
          'fractional-count',
          finding((f) => {
            f.numbers = { ...f.numbers, count: f.numbers.count + 5e-10 };
          }),
          /do not follow from the archived cells/,
        ],
        [
          'other-scope',
          finding((f) => {
            f.release_id = allRelease;
          }),
          /not a release of this round and scope/,
        ],
        // Finding sets (2.5) belong to the archive the same way.
        [
          'set-foreign-release',
          resealed((x) => {
            x.finding_sets![0]!.release_id = randomUUID();
          }),
          /not a release of this round/,
        ],
        [
          'set-other-scope',
          resealed((x) => {
            const i = x.finding_sets!.findIndex((y) => y.scope !== 'all');
            x.finding_sets![i] = { ...x.finding_sets![i]!, scope: 'all' };
          }),
          /not a scope of that release/,
        ],
        [
          'set-unknown-rule',
          resealed((x) => {
            x.finding_sets![0]!.rule_keys.push(`${archive.template.key}.zz_ukjend@1`);
          }),
          /is not a rule of the archive/,
        ],
        [
          'set-other-version',
          resealed((x) => {
            // A second version in the archive, named by the set, while the Finding says 1.
            const rule = x.finding_rules.find((r) => r.key === own.rule_key)!;
            x.finding_rules.push({
              ...rule,
              version: 2,
              definition: { ...rule.definition, version: 2 },
            });
            const set = x.finding_sets!.find(
              (y) => y.release_id === own.release_id && y.scope === own.client_id,
            )!;
            set.rule_keys = set.rule_keys.map((k) =>
              k === `${own.rule_key}@${own.rule_version}` ? `${own.rule_key}@2` : k,
            );
          }),
          /is not the version of the set/,
        ],
      ] as const)
        await expect(cli(save(`${name}.json`, bad)), name).rejects.toThrow(message);
      await expect(cli(file, '--sha256', 'f'.repeat(64))).rejects.toThrow(
        /not the one of the export/,
      );
      // A new version of a key the database already has would change other rounds, and so would
      // a key that is new to a family the database already has. Rule versions are never deleted
      // (2.5), so each of these refusals gets a database of its own.
      const rule = archive.finding_rules[0]!;
      await refusedWithRule({ ...rule, version: 99 }, file, /in the database in other versions/);
      const metric = archive.metric_definitions.find((d) => d.definition.kind === 'zone')!;
      await prisma.metricDefinition.create({
        data: { key: metric.key, version: 99, definition: metric.definition },
      });
      // The family is now known too, so a sibling key may be the first refusal.
      await expect(cli(file)).rejects.toThrow(/would change other rounds/);
      await prisma.metricDefinition.deleteMany({ where: { version: 99 } });
      const newKey = `${archive.template.key}.zz_other`;
      await refusedWithRule(
        {
          key: newKey,
          version: 1,
          channel: 'aggregate',
          definition: { ...rule.definition, key: newKey },
        },
        file,
        /is new to the .* rules in the database/,
      );
      expect(await prisma.round.count()).toBe(0);
      expect(await prisma.client.count()).toBe(0);
      expect(await prisma.finding.count()).toBe(0);
      expect(await prisma.findingSet.count()).toBe(0);
      expect(await prisma.findingRule.count()).toBe(0);

      expect(await cli(file, '--sha256', archive.sha256)).toMatchObject({
        outcome: 'restored',
        snapshots: archive.snapshots.length,
      });
      const again = await copy.app.get(RoundArchiveService).body(round);
      for (const part of [
        'snapshots',
        'metric_definitions',
        'finding_rules',
        'findings',
        'finding_sets',
        'round_metric_set',
        'releases',
        'round',
        'template_version',
        'clients',
        'round_clients',
      ] as const)
        expect(canonical(again[part]), part).toBe(canonical(archive[part]));
      expect(restorable(again)).toBe(restorable(archive));
      expect(await withPg((c) => c.query('SELECT 1 FROM response'))).toMatchObject({ rowCount: 0 });

      // Dashboard and client report as before; reading them adds no Finding (2.5 × 5.1).
      expect(await views(copy, await adminOf(copy))).toEqual(before);
      expect(await prisma.finding.count()).toBe(archive.findings.length);
      expect(await prisma.findingSet.count()).toBe(archive.finding_sets!.length);

      expect(await cli(file)).toMatchObject({ outcome: 'unchanged' });
      const rows = await withPg((c) =>
        c.query<{ n: string }>('SELECT count(*) AS n FROM aggregate_snapshot WHERE round_id = $1', [
          round,
        ]),
      );
      expect(Number(rows.rows[0]!.n)).toBe(archive.snapshots.length);
      const other = resealed((x) => {
        x.round.name += ' (endra)';
      });
      await expect(cli(save('other.json', other))).rejects.toThrow(/other content/);
      expect(
        await prisma.auditLog.count({
          where: { what: 'archive.restore', target: `round:${round}` },
        }),
      ).toBe(2);
    } finally {
      await copy?.app.close();
      await dispose();
    }
  });

  it('an archive written before 2.5 (no finding sets) restores with the sets the migration makes', async () => {
    const before = await views(t, cookie);
    const old: Partial<RoundArchive> = structuredClone(archive);
    delete old.sha256;
    delete old.finding_sets;
    // A newer version of a quiet rule (F3, nobody answered «nei/usikker») that would fire on
    // every answer: computing again with the newest rules would add Findings and change views.
    const f3 = old.finding_rules!.find((r) => r.key === 'tryggleik.f3')!;
    expect(archive.findings.some((x) => x.rule_key === f3.key)).toBe(false);
    // Right after version 1, in the order an export writes rules (key, then version), so a
    // repeated restore compares equal.
    old.finding_rules!.splice(old.finding_rules!.indexOf(f3) + 1, 0, {
      ...f3,
      version: 2,
      definition: {
        ...f3.definition,
        version: 2,
        options: ['ja', 'delvis', 'nei', 'usikker'],
        threshold: { medium: 0, high: 0 },
        min_count: 1,
      },
    });
    const legacy = save('before-2.5.json', { ...old, sha256: archiveHash(old as ArchiveBody) });
    const dispose = await temporaryDatabase();
    let copy: TestApp | undefined;
    try {
      expect(await cli(legacy)).toMatchObject({ outcome: 'restored' });
      copy = await startApp({});
      const prisma = copy.app.get(PrismaService);
      // The sets of the current releases: the smallest saved version, else the archived one.
      const current = new Set(
        archive.snapshots.filter((x) => x.status === 'released').map((x) => x.release_id),
      );
      const written = await prisma.findingSet.findMany({ where: { round_id: round } });
      const restored = setsOf({ finding_sets: written } as unknown as ArchiveBody);
      expect(restored).toEqual(setsOf(archive).filter((x) => current.has(x.release_id)));
      expect(restored.every((x) => x.rule_keys.includes(`${f3.key}@1`))).toBe(true);
      expect(await views(copy, await adminOf(copy))).toEqual(before);
      expect(await prisma.finding.count()).toBe(archive.findings.length);
      expect(await cli(legacy)).toMatchObject({ outcome: 'unchanged' });
    } finally {
      await copy?.app.close();
      await dispose();
    }
  });
});
