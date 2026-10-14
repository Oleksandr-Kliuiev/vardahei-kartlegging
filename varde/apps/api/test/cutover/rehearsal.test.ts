import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForgetService } from '../../src/modules/retention/forget.service.js';
import { DeletionLedger } from '../../src/modules/retention/ledger.js';
import { SvarImportService, type SvarManifest } from '../../src/modules/imports/svar-import.js';
import { Runde1ImportService } from '../../src/modules/imports/runde1-import.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { fixtureText } from '../support/fixtures.js';
import { readmeCounts } from '../support/imports.js';
import { withPg } from '../support/rounds.js';
import {
  cleanupSubmissions,
  submissionRound,
  submissionBody,
  postSubmission,
  storedSubmissions,
} from '../support/submissions.js';
import { startOldServer } from '../../../../tools/parity/old-server.mjs';
import { cleanArchive } from '../../../../tools/cutover/clean-archive.mjs';

interface LegacyRow {
  k: string;
  init: string;
  svar: Record<string, unknown>;
}
describe.skipIf(!process.env.VARDE_REHEARSAL_DATABASE)(
  'eight actual cutover and rollback steps in an empty database',
  () => {
    let f: DashboardFixture, old: Awaited<ReturnType<typeof startOldServer>>, dir: string;
    let live: Awaited<ReturnType<typeof submissionRound>>, body: ReturnType<typeof submissionBody>;
    let beforeSnapshots: unknown[], cleaned: { svar: string; runde1: string };
    const files = {
      svar: fixtureText('svar.synthetic.jsonl'),
      runde1: fixtureText('runde1.synthetic.js'),
      tilgang: fixtureText('tilgang.json'),
      kundar: fixtureText('kundar.json'),
    };
    const snapshots = () =>
      withPg(
        async (c) =>
          (
            await c.query<{ v: unknown }>(
              'SELECT row_to_json(s) v FROM aggregate_snapshot s ORDER BY id',
            )
          ).rows,
      );
    beforeAll(async () => {
      expect(
        await withPg(async (c) =>
          Number((await c.query<{ n: string }>('SELECT count(*) n FROM response')).rows[0]!.n),
        ),
      ).toBe(0);
      dir = mkdtempSync(join(tmpdir(), 'varde-rehearsal-'));
      old = await startOldServer(files);
    }, 180_000);
    afterAll(async () => {
      if (old) await old.stop();
      if (f) {
        if (live) await cleanupSubmissions(f.prisma, [live.round.id]);
        await f.close();
      }
      if (dir) rmSync(dir, { recursive: true, force: true });
    });
    it('1: legacy accepts synthetic data; Varde is empty', async () => {
      expect((await fetch(old.base + '/healthz')).status).toBe(200);
      expect(
        await withPg(async (c) =>
          Number((await c.query<{ n: string }>('SELECT count(*) n FROM response')).rows[0]!.n),
        ),
      ).toBe(0);
    });
    it('2: seed and import reconcile every part against fixture counts', async () => {
      f = await dashboardFixture();
      const m = await f.prisma.importManifest.findFirstOrThrow({
        where: { source: 'svar' },
        orderBy: { at: 'desc' },
      });
      const counts = m.counts as unknown as SvarManifest['counts'];
      // Independent source-side counters, including rejected rows (no self-derived reference).
      const lines = files.svar
        .trim()
        .split('\n')
        .map((s) => JSON.parse(s) as { leiardel: boolean });
      const expected = readmeCounts().counts;
      expect(lines.length).toBe(expected.lines);
      expect(lines.filter((r) => r.leiardel).length).toBe(expected.leiardel);
      expect(counts.lines).toBe(expected.lines);
      expect(counts.leiardel).toBe(expected.leiardel);
      expect(counts.rejected).toEqual({common: expected.rejected.common, leader: expected.rejected.leader});
      for (const [key, round, name] of [
        ['tryggleik', f.tryggleik, 'Runde 2 IT-tryggleik'],
        ['ki', f.ki, 'KI runde 1'],
        ['ki-2026-10-12', f.anon, 'KI 2026-10-12 (anonym)'],
      ] as const) {
        expect(counts.rounds[name]?.common).toEqual({
          accepted: expected.rounds[key]!.common,
          existing: 0,
          suppressed: 0,
        });
        expect(counts.rounds[name]?.leader).toEqual({
          accepted: expected.rounds[key]!.leader,
          existing: 0,
          suppressed: 0,
        });
        const clients = await withPg(
          async (c) =>
            (
              await c.query<{ slug: string; n: string }>(
                "SELECT c.slug,count(*) n FROM response r JOIN round_client rc ON rc.id=r.round_client_id JOIN client c ON c.id=rc.client_id WHERE rc.round_id=$1 AND r.part='common' GROUP BY c.slug",
                [round],
              )
            ).rows,
        );
        expect(Object.fromEntries(clients.map((c) => [c.slug, Number(c.n)]))).toEqual(
          expected.rounds[key]!.clients,
        );
      }
      const byPart = await withPg(
        async (c) =>
          (
            await c.query<{ part: string; n: string }>(
              'SELECT part,count(*) n FROM response GROUP BY part',
            )
          ).rows,
      );
      expect(Number(byPart.find((r) => r.part === 'common')!.n)).toBe(
        Object.values(expected.rounds).reduce((n, r) => n + r.common, 0) + 40,
      );
      expect(Number(byPart.find((r) => r.part === 'leader')!.n)).toBe(
        Object.values(expected.rounds).reduce((n, r) => n + r.leader, 0),
      );
    }, 180_000);
    it('3: close and release without live fallback', async () => {
      expect(
        (
          await f.prisma.round.findMany({
            where: { id: { in: [f.tryggleik, f.ki, f.anon, f.runde1] } },
          })
        ).every((r) => r.status === 'closed'),
      ).toBe(true);
      beforeSnapshots = await snapshots();
      expect(beforeSnapshots.length).toBeGreaterThan(100);
    });
    it('4: read-only cutover with a real tar archive and reviewable Caddy plan', async () => {
      for (const [name, value] of Object.entries(files))
        writeFileSync(join(dir, name), value, { mode: 0o600 });
      execFileSync('tar', [
        '-cf',
        join(dir, 'archive.tar'),
        '-C',
        dir,
        'svar',
        'runde1',
        'tilgang',
        'kundar',
      ]);
      expect(readFileSync(join(dir, 'archive.tar')).length).toBeGreaterThan(1000);
      await old.stop();
      old = await startOldServer(files, { readOnly: true });
      expect(
        (await fetch(old.base + '/api/framdrift', { method: 'POST', body: '{}' })).status,
      ).toBe(410);
      const plan = readFileSync(
        join(__dirname, '../../../../infra/caddy/kartlegging-legacy.caddy'),
        'utf8',
      );
      expect(plan).toContain('/r/legacy?{query}');
      expect(plan).toContain('respond 404');
    });
    it('5: a new Varde round accepts an answer in the rollback window', async () => {
      live = await submissionRound(f);
      body = submissionBody();
      expect((await postSubmission(f, live.code, body)).statusCode).toBe(201);
    });
    it('6: forget respondent, anonymous leader only, and anonymous common only', async () => {
      const ctx = { window: { RUNDE1: { svar: [] as LegacyRow[] } } };
      runInNewContext(files.runde1, ctx);
      const person = ctx.window.RUNDE1.svar[0]!;
      const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: person.k } });
      const forget = f.app.get(ForgetService);
      expect(
        (
          await forget.forget(
            { scope: 'respondent', client: client.id, respondent_key: person.init },
            'synthetic rehearsal',
            f.session,
          )
        ).common,
      ).toBeGreaterThan(1);
      for (const part of ['leader', 'common']) {
        const row = await withPg(
          async (c) =>
            (
              await c.query<{ submission_id: string }>(
                `SELECT r.submission_id FROM response r JOIN round_client rc ON rc.id=r.round_client_id WHERE rc.round_id=$1 AND r.part=$2 LIMIT 1`,
                [f.anon, part],
              )
            ).rows[0]!,
        );
        expect(
          (
            await forget.forget(
              { scope: 'submissions', submission_ids: [row.submission_id] },
              'synthetic rehearsal',
              f.session,
            )
          ).total,
        ).toBe(1);
      }
    });
    it('7: restore tar, clean by actual ledger; read-only rollback cannot collect answers', async () => {
      execFileSync('tar', ['-xf', join(dir, 'archive.tar'), '-C', dir]);
      const ledger = await f.app.get(DeletionLedger).tombstonesForKartlegging();
      cleaned = cleanArchive(
        ledger,
        readFileSync(join(dir, 'svar'), 'utf8'),
        readFileSync(join(dir, 'runde1'), 'utf8'),
      );
      expect(cleaned.svar).not.toBe(files.svar);
      expect(cleaned.runde1).not.toBe(files.runde1);
      const oldIds = new Set(
        cleaned.svar
          .trim()
          .split('\n')
          .map((s) => (JSON.parse(s) as { id: string }).id),
      );
      for (const t of ledger.filter((t) => t.part === 'common' && t.source_id?.length === 36))
        expect(oldIds.has(t.source_id!)).toBe(false);
      for (const t of ledger.filter((t) => t.part === 'leader')) {
        const row = cleaned.svar
          .trim()
          .split('\n')
          .map(
            (s) =>
              JSON.parse(s) as {
                id: string;
                leiardel: boolean;
                svar: Record<string, unknown>;
                fri: Record<string, unknown>;
              },
          )
          .find((r) => r.id === t.source_id);
        if (row) {
          expect(row.leiardel).toBe(false);
          expect(Object.keys(row.svar).some((k) => /^(B|L)\d/.test(k))).toBe(false);
        }
      }
      await old.stop();
      old = await startOldServer({ ...files, ...cleaned }, { readOnly: true });
      const path = join(old.root, 'data', 'svar.jsonl');
      const hash = () => createHash('sha256').update(readFileSync(path)).digest('hex');
      const before = hash();
      for (const endpoint of ['svar', 'framdrift'])
        expect(
          (await fetch(old.base + '/api/' + endpoint, { method: 'POST', body: '{}' })).status,
        ).toBe(410);
      expect(hash()).toBe(before);
      const ctx = { window: { RUNDE1: { svar: [] as LegacyRow[] } } };
      runInNewContext(cleaned.runde1, ctx);
      expect(ctx.window.RUNDE1.svar.length).toBe(39);
    });
    it('8: recutover creates zero parts, suppresses dirty archive; snapshots and window answer survive', async () => {
      const imports = f.app.get(SvarImportService);
      const m = await imports.importSvar(cleaned.svar, { who: 'test:recutover' });
      const r = await f.app
        .get(Runde1ImportService)
        .importRunde1(cleaned.runde1, { who: 'test:recutover' });
      expect(
        Object.values(m.counts.rounds).reduce(
          (n, r) => n + r.common.accepted + r.leader.accepted,
          0,
        ),
      ).toBe(0);
      expect(r.counts.common.accepted).toBe(0);
      const dirty = await imports.importSvar(files.svar, { who: 'test:negative' });
      expect(
        Object.values(dirty.counts.rounds).reduce(
          (n, r) => n + r.common.suppressed + r.leader.suppressed,
          0,
        ),
      ).toBeGreaterThan(2);
      expect(
        Object.values(dirty.counts.rounds).reduce(
          (n, r) => n + r.common.accepted + r.leader.accepted,
          0,
        ),
      ).toBe(0);
      const tombs = await f.app.get(DeletionLedger).tombstonesForKartlegging();
      const expectedSuppressed = new Set(
        tombs.filter((t) => t.source_id?.length === 36).map((t) => t.source_id + '|' + t.part),
      ).size;
      expect(
        Object.values(dirty.counts.rounds).reduce(
          (n, r) => n + r.common.suppressed + r.leader.suppressed,
          0,
        ),
      ).toBe(expectedSuppressed);
      const dirtyR1 = await f.app
        .get(Runde1ImportService)
        .importRunde1(files.runde1, { who: 'test:negative-runde1' });
      expect(dirtyR1.counts.common).toEqual({ accepted: 0, existing: 39, suppressed: 1 });
      expect(await snapshots()).toEqual(beforeSnapshots);
      expect((await storedSubmissions(live.rc.id))[0]?.submission_id).toBe(body.submission_id);
      const response = await f.get(
        '/r/legacy?s=tryggleik&k=daco&t=' +
          encodeURIComponent((JSON.parse(files.tilgang) as Record<string, string>).daco!),
      );
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('avslutta');
    });
  },
);
