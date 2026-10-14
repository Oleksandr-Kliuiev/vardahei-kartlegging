// Task 1.8 (integration): import of svar.jsonl on the synthetic fixtures (ADR-024, ADR-025).
// Tombstones are inserted directly (forget is 1.31b).
import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/bootstrap.js';
import { SvarImportService, type SvarManifest } from '../../src/modules/imports/svar-import.js';
import * as svarLines from '../../src/modules/imports/svar-lines.js';
import { PrismaResponseSource } from '../../src/modules/privacy/prisma-source.js';
import { SeedService } from '../../src/modules/rounds/seed.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { clients, fixtureText, kundar, tilgang } from '../support/fixtures.js';
import { countBySource, readmeCounts, resetImports, tombstone } from '../support/imports.js';
import { withPg } from '../support/rounds.js';
import { SEED_DIR } from '../support/seed-dir.js';

let app: NestFastifyApplication;
let prisma: PrismaService;
let svc: SvarImportService;
let first: SvarManifest;
let second: SvarManifest;
const FILE = fixtureText('svar.synthetic.jsonl');
const LINES = FILE.trimEnd().split('\n');
const { counts: expected, edgeLines, kiOldLines } = readmeCounts();
const NAME = {
  tryggleik: 'Runde 2 IT-tryggleik',
  ki: 'KI runde 1',
  'ki-2026-10-12': 'KI 2026-10-12 (anonym)',
} as const;
const run = (text: string, dryRun = false) => svc.importSvar(text, { who: 'test:import', dryRun });
type Row = {
  id: string;
  leiardel: boolean;
  skjema: string;
  versjon: string;
  k: string;
  svar: Record<string, unknown>;
};
const rowOf = (n: number) => JSON.parse(LINES[n - 1] ?? '{}') as Row;
const withId = (row: Row, id: string) => JSON.stringify({ ...row, id });
/** A tryggleik line with a filled leader part (not an edge line). */
const leaderLine = () =>
  LINES.map((l, i) => ({ row: JSON.parse(l) as Row, n: i + 1 })).find(
    (x) =>
      x.row.skjema === 'tryggleik' &&
      x.row.leiardel &&
      !edgeLines.includes(x.n) &&
      Object.keys(x.row.svar).some((k) => k.startsWith('B')),
  )!.row;

beforeAll(async () => {
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
  svc = app.get(SvarImportService);
  await app.get(SeedService).seedAll({
    clients: clients(),
    kundar: kundar(),
    tilgang: tilgang(),
    seedDir: SEED_DIR,
    who: 'test:seed',
  });
  await resetImports(prisma);
  first = await run(FILE);
  second = await run(FILE);
});

afterAll(async () => {
  await resetImports(prisma);
  await app.close();
});

const fixtureIds = () =>
  LINES.map((l) => (JSON.parse(l) as { id?: string }).id).filter(
    (x): x is string => x !== undefined,
  );

describe('import of svar.jsonl (1.8)', () => {
  it('counts per round and part equal fixtures/README.md', () => {
    for (const [key, name] of Object.entries(NAME)) {
      const r = first.counts.rounds[name];
      expect(r?.common.accepted, name).toBe(expected.rounds[key]?.common);
      expect(r?.leader.accepted, name).toBe(expected.rounds[key]?.leader);
    }
    expect(first.counts.rejected).toEqual({
      common: expected.rejected.common,
      leader: expected.rejected.leader,
    });
    expect(first.counts.dropped_answers).toBe(0);
  });

  it('reconciliation by part: lines = common decisions + rejected; leiardel lines = leader decisions + rejected', () => {
    const rs = Object.values(first.counts.rounds);
    const total = (p: 'common' | 'leader') =>
      rs.reduce((n, r) => n + r[p].accepted + r[p].existing + r[p].suppressed, 0);
    expect(total('common') + first.counts.rejected.common).toBe(first.counts.lines);
    expect(total('leader') + first.counts.rejected.leader).toBe(first.counts.leiardel);
    expect(first.counts.lines).toBe(LINES.length);
  });

  it('a repeated import adds 0 rows: everything existing', async () => {
    for (const r of Object.values(second.counts.rounds)) {
      expect(r.common.accepted + r.leader.accepted).toBe(0);
      expect(r.common.existing + r.leader.existing).toBeGreaterThan(0);
    }
    const n = await withPg((c) => countBySource(c, fixtureIds()));
    const accepted = (p: 'common' | 'leader') =>
      Object.values(first.counts.rounds).reduce((s, r) => s + r[p].accepted, 0);
    expect(n).toEqual({ common: accepted('common'), leader: accepted('leader') });
  });

  it('rejected lines are listed by number; a line without id is rejected in common and, with leiardel, in leader', () => {
    const lines = first.rejected.filter((r) => r.reason !== 'leader_empty').map((r) => r.line);
    expect(lines).toEqual(edgeLines);
    const noId = first.rejected.filter((r) => r.reason === 'no_id');
    expect(noId.map((r) => r.parts)).toEqual([['common'], ['common', 'leader']]);
    expect(first.rejected.find((r) => r.reason === 'leader_empty')?.parts).toEqual(['leader']);
    expect(first.rejected.filter((r) => r.reason === 'duplicate_id')).toHaveLength(2);
  });

  it('rejected lines create no parts', async () => {
    const dup = rowOf(edgeLines[1]!).id;
    expect(await withPg((c) => countBySource(c, [dup]))).toEqual({});
  });

  it('answers carry no F1 and no K0; tryggleik and KI 2026-10-13 have respondent_key, KI 2026-10-12 none', async () => {
    const rows = await withPg((c) =>
      c.query<{ name: string; key: string | null; has_id: boolean; identification: string }>(
        `SELECT r.name, x.respondent_key AS key, (x.answers ? 'F1' OR x.answers ? 'K0') AS has_id, r.identification
           FROM response x JOIN round_client rc ON rc.id = x.round_client_id JOIN round r ON r.id = rc.round_id
          WHERE x.source_id = ANY($1)`,
        [fixtureIds()],
      ),
    );
    expect(rows.rows.some((r) => r.has_id)).toBe(false);
    for (const r of rows.rows) {
      if (r.name === NAME['ki-2026-10-12'])
        expect([r.key, r.identification]).toEqual([null, 'none']);
      else expect(r.key, r.name).toMatch(/^Q[A-H]X[A-K][MNP]$/);
    }
  });

  it('the anonymous round and its RoundClients exist once, closed; repeated import does not duplicate', async () => {
    const anon = await prisma.round.findMany({
      where: { name: NAME['ki-2026-10-12'] },
      include: { round_clients: true },
    });
    expect(anon).toHaveLength(1);
    expect(anon[0]?.status).toBe('closed');
    expect(anon[0]?.identification).toBe('none');
    const slugs = new Set(kiOldLines.map((n) => rowOf(n).k));
    expect(anon[0]?.round_clients).toHaveLength(slugs.size);
    expect(
      anon[0]?.round_clients.every((rc) => rc.status === 'closed' && rc.legacy_code_hash === null),
    ).toBe(true);
  });

  it('roundMode of the Prisma source: tryggleik and KI 2026-10-13 initials, KI 2026-10-12 none', async () => {
    const source = new PrismaResponseSource(prisma);
    expect(await source.roundMode(first.counts.rounds[NAME.tryggleik]!.round_id)).toBe('initials');
    expect(await source.roundMode(first.counts.rounds[NAME.ki]!.round_id)).toBe('initials');
    expect(await source.roundMode(first.counts.rounds[NAME['ki-2026-10-12']]!.round_id)).toBe(
      'none',
    );
  });

  it('both tryggleik versions land in one round', () => {
    const versions = new Set(
      LINES.map((l) => JSON.parse(l) as Row)
        .filter((r) => r.skjema === 'tryggleik')
        .map((r) => r.versjon),
    );
    expect([...versions].sort()).toEqual(['2026-09-01', '2026-10-12', '2026-10-13']);
    expect(Object.keys(first.counts.rounds).filter((n) => n.includes('tryggleik'))).toEqual([
      NAME.tryggleik,
    ]);
  });

  it('the manifest JSON has no initials of the fixture', async () => {
    const m = await prisma.importManifest.findUniqueOrThrow({ where: { id: first.id ?? '' } });
    const text = JSON.stringify(m);
    for (const l of LINES) {
      const r = JSON.parse(l) as Row;
      for (const init of [r.svar.F1, r.svar.K0].filter((x): x is string => typeof x === 'string'))
        expect(text).not.toContain(init);
    }
    expect(m.status).toBe('ok');
    expect(m.round_ids).toHaveLength(3);
  });

  it('a dry run writes nothing', async () => {
    const id = randomUUID();
    const before = await prisma.importManifest.count();
    const m = await run(withId(leaderLine(), id), true);
    expect(m.dry_run).toBe(true);
    expect(await prisma.importManifest.count()).toBe(before);
    expect(await withPg((c) => countBySource(c, [id]))).toEqual({});
  });

  it('a leader part with a tombstone (source_id, leader) is not created, even without a common part', async () => {
    const id = randomUUID();
    const t = first.counts.rounds[NAME.tryggleik]!;
    const client = await prisma.client.findUniqueOrThrow({ where: { slug: leaderLine().k } });
    await withPg(async (c) => {
      await tombstone(c, id, 'leader', t.round_id, client.id);
      await tombstone(c, id, 'common', t.round_id, client.id);
    });
    const m = await run(withId(leaderLine(), id));
    expect(m.counts.rounds[NAME.tryggleik]?.leader.suppressed).toBe(1);
    expect(m.counts.rounds[NAME.tryggleik]?.common.suppressed).toBe(1);
    expect(await withPg((c) => countBySource(c, [id]))).toEqual({});
  });

  it('a leader-only tombstone suppresses leader and still creates common', async () => {
    const id = randomUUID();
    const t = first.counts.rounds[NAME.tryggleik]!;
    const client = await prisma.client.findUniqueOrThrow({ where: { slug: leaderLine().k } });
    await withPg((c) => tombstone(c, id, 'leader', t.round_id, client.id));
    const m = await run(withId(leaderLine(), id));
    expect(m.counts.rounds[NAME.tryggleik]?.leader).toEqual({
      accepted: 0,
      existing: 0,
      suppressed: 1,
    });
    expect(m.counts.rounds[NAME.tryggleik]?.common).toEqual({
      accepted: 1,
      existing: 0,
      suppressed: 0,
    });
    expect(await withPg((c) => countBySource(c, [id]))).toEqual({ common: 1 });
  });

  it.each(['lines', 'leiardel'] as const)(
    'a %s mismatch rolls back and saves a failed manifest',
    async (counter) => {
      const id = randomUUID();
      const text = withId(leaderLine(), id);
      const sourceHash = createHash('sha256').update(text).digest('hex');
      const parse = svarLines.parseSvar;
      const spy = vi.spyOn(svarLines, 'parseSvar').mockImplementationOnce((...args) => {
        const parsed = parse(...args);
        return { ...parsed, [counter]: parsed[counter] + 1 };
      });
      try {
        await expect(run(text)).rejects.toThrow(/reconciliation/);
      } finally {
        spy.mockRestore();
      }
      expect(await withPg((c) => countBySource(c, [id]))).toEqual({});
      const manifests = await prisma.importManifest.findMany({
        where: { source_hash: sourceHash },
      });
      expect(manifests).toHaveLength(1);
      expect(manifests[0]).toMatchObject({
        source: 'svar',
        status: 'failed',
        round_ids: [],
        started_by: 'test:import',
        rejected: [],
      });
      expect(JSON.stringify(manifests[0]?.counts)).toContain('reconciliation');
    },
  );

  it('a deleted common part does not block the leader part', async () => {
    const id = randomUUID();
    const t = first.counts.rounds[NAME.tryggleik]!;
    const client = await prisma.client.findUniqueOrThrow({ where: { slug: leaderLine().k } });
    await withPg((c) => tombstone(c, id, 'common', t.round_id, client.id));
    const m = await run(withId(leaderLine(), id));
    expect(m.counts.rounds[NAME.tryggleik]?.common.suppressed).toBe(1);
    expect(m.counts.rounds[NAME.tryggleik]?.leader.accepted).toBe(1);
    expect(await withPg((c) => countBySource(c, [id]))).toEqual({ leader: 1 });
  });

  it('a deleted row does not come back on re-import', async () => {
    const id = randomUUID();
    await run(withId(leaderLine(), id));
    const t = first.counts.rounds[NAME.tryggleik]!;
    const client = await prisma.client.findUniqueOrThrow({ where: { slug: leaderLine().k } });
    await withPg(async (c) => {
      await c.query('DELETE FROM response WHERE source_id = $1', [id]);
      await tombstone(c, id, 'common', t.round_id, client.id);
      await tombstone(c, id, 'leader', t.round_id, client.id);
    });
    const m = await run(withId(leaderLine(), id));
    expect(m.counts.rounds[NAME.tryggleik]?.common).toEqual({
      accepted: 0,
      existing: 0,
      suppressed: 1,
    });
    expect(await withPg((c) => countBySource(c, [id]))).toEqual({});
  });

  it('import A, then A + B with the same leader part → two leader Responses', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    await run(withId(leaderLine(), a));
    const m = await run(`${withId(leaderLine(), a)}\n${withId(leaderLine(), b)}\n`);
    expect(m.counts.rounds[NAME.tryggleik]?.leader).toEqual({
      accepted: 1,
      existing: 1,
      suppressed: 0,
    });
    expect(await withPg((c) => countBySource(c, [a, b]))).toEqual({ common: 2, leader: 2 });
  });

  it('counts of common/leader rows in the database equal the manifest', async () => {
    const rows = await withPg((c) =>
      c.query<{ name: string; part: string; n: string }>(
        `SELECT r.name, x.part, count(*) AS n FROM response x JOIN round_client rc ON rc.id = x.round_client_id
           JOIN round r ON r.id = rc.round_id WHERE x.source_id = ANY($1) GROUP BY r.name, x.part`,
        [fixtureIds()],
      ),
    );
    for (const r of rows.rows) {
      const m = first.counts.rounds[r.name]!;
      expect(Number(r.n), `${r.name} ${r.part}`).toBe(m[r.part as 'common' | 'leader'].accepted);
    }
  });
});
