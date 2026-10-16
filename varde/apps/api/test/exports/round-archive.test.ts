// Task 5.2 (integration): archive of a closed round → empty migrated database → restore "as
// snapshots". A synthetic identified round of its own (initials, free text, leader parts, a
// client below k; auto release at close plus a manual release, so superseded rows with reasons)
// keeps the archive small whatever else the test database holds. Snapshots, definitions,
// rules and Findings are canonically the same after restore, the dashboard equals the original,
// a repeated restore is a no-op and a changed archive is refused without writing anything.
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
  restorable,
  RoundArchive,
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

  it('restore into an empty database: canonically the same, same dashboard, then a no-op', async () => {
    const before = await Promise.all(
      dashboards().map(
        async (q) =>
          JSON.parse(
            (await t.get(`/api/admin/dashboard?round=${round}${q}`, cookie)).body,
          ) as unknown,
      ),
    );
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
          'other-scope',
          finding((f) => {
            f.release_id = allRelease;
          }),
          /not a release of this round and scope/,
        ],
      ] as const)
        await expect(cli(save(`${name}.json`, bad)), name).rejects.toThrow(message);
      await expect(cli(file, '--sha256', 'f'.repeat(64))).rejects.toThrow(
        /not the one of the export/,
      );
      // A new version of a key the database already has would change other rounds.
      const rule = archive.finding_rules[0]!;
      await prisma.findingRule.create({
        data: { key: rule.key, version: 99, channel: rule.channel, definition: rule.definition },
      });
      await expect(cli(file)).rejects.toThrow(/in the database in other versions/);
      await prisma.findingRule.deleteMany({ where: { version: 99 } });
      const metric = archive.metric_definitions.find((d) => d.definition.kind === 'zone')!;
      await prisma.metricDefinition.create({
        data: { key: metric.key, version: 99, definition: metric.definition },
      });
      await expect(cli(file)).rejects.toThrow(/in the database in other versions/);
      await prisma.metricDefinition.deleteMany({ where: { version: 99 } });
      expect(await prisma.round.count()).toBe(0);
      expect(await prisma.client.count()).toBe(0);
      expect(await prisma.finding.count()).toBe(0);

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

      const session = await copy.store.create({
        oid: WHO,
        name: 'Syntetisk admin',
        via: 'entra',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      const restored = {
        varde_session: copy.app.getHttpAdapter().getInstance().signCookie(session.sid),
      };
      for (const [i, q] of dashboards().entries()) {
        const after = await copy.get(`/api/admin/dashboard?round=${round}${q}`, restored);
        expect(after.statusCode, q).toBe(200);
        expect(JSON.parse(after.body), q).toEqual(before[i]);
      }

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
});
