// Task 1.9 (integration): import of round 1 (runde1.js format) on the synthetic fixture.
import 'reflect-metadata';
import vm from 'node:vm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap.js';
import {
  type Runde1Manifest,
  Runde1ImportService,
  RUNDE1_ROUND,
  runde1SourceId,
} from '../../src/modules/imports/runde1-import.js';
import { SeedService } from '../../src/modules/rounds/seed.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { clients, fixtureText, kundar, tilgang } from '../support/fixtures.js';
import { countBySource, resetImports, tombstone } from '../support/imports.js';
import { withPg } from '../support/rounds.js';
import { SEED_DIR } from '../support/seed-dir.js';

let app: NestFastifyApplication;
let prisma: PrismaService;
let svc: Runde1ImportService;
let first: Runde1Manifest;
let second: Runde1Manifest;
const SRC = fixtureText('runde1.synthetic.js');
const window: { RUNDE1?: { svar: { k: string; init: string; svar: Record<string, unknown> }[] } } =
  {};
vm.runInNewContext(SRC, { window });
const RECORDS = window.RUNDE1!.svar;
const ids = () => RECORDS.map((r) => runde1SourceId(r.k, r.init));
const run = () => svc.importRunde1(SRC, { who: 'test:runde1' });

beforeAll(async () => {
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
  svc = app.get(Runde1ImportService);
  await app
    .get(SeedService)
    .seedAll({
      clients: clients(),
      kundar: kundar(),
      tilgang: tilgang(),
      seedDir: SEED_DIR,
      who: 'test:seed',
    });
  await resetImports(prisma);
  first = await run();
  second = await run();
});

afterAll(async () => {
  await resetImports(prisma);
  await app.close();
});

describe('import of round 1 (1.9)', () => {
  it('records = accepted + existing + suppressed; no leader part', async () => {
    const c = first.counts.common;
    expect(c.accepted + c.existing + c.suppressed).toBe(RECORDS.length);
    expect(c.accepted).toBe(40);
    expect(first.counts.leader).toBe(0);
    expect(await withPg((x) => countBySource(x, ids()))).toEqual({ common: 40 });
  });

  it('a repeated import adds 0 rows', () => {
    expect(second.counts.common).toEqual({ accepted: 0, existing: 40, suppressed: 0 });
  });

  it('counts per client equal the fixture', () => {
    const expected: Record<string, number> = {};
    for (const r of RECORDS) expected[r.k] = (expected[r.k] ?? 0) + 1;
    expect(first.counts.clients).toEqual(expected);
  });

  it('respondent_key upper case, ≤ 8, not in answers; role from F2; the round is external_import with initials', async () => {
    const rows = await withPg((c) =>
      c.query<{
        key: string;
        role: string;
        f2: string;
        has_init: boolean;
        day: string;
        type: string;
        ident: string;
      }>(
        `SELECT x.respondent_key AS key, x.role, x.answers->>'F2' AS f2, (x.answers ? 'F1' OR x.answers ? 'init') AS has_init,
                to_char(x.submitted_day, 'YYYY-MM-DD') AS day, r.type, r.identification AS ident
           FROM response x JOIN round_client rc ON rc.id = x.round_client_id JOIN round r ON r.id = rc.round_id
          WHERE x.source_id = ANY($1)`,
        [ids()],
      ),
    );
    for (const r of rows.rows) {
      expect(r.key).toBe(r.key.toUpperCase());
      expect(r.key.length).toBeLessThanOrEqual(8);
      expect(r.role).toBe(r.f2);
      expect(r.has_init).toBe(false);
      expect([r.day, r.type, r.ident]).toEqual(['2026-01-01', 'external_import', 'initials']);
    }
  });

  it('a record with a tombstone does not come back', async () => {
    const victim = RECORDS[0]!;
    const sid = runde1SourceId(victim.k, victim.init);
    const round = await prisma.round.findFirstOrThrow({ where: { name: RUNDE1_ROUND } });
    const client = await prisma.client.findUniqueOrThrow({ where: { slug: victim.k } });
    await withPg(async (c) => {
      await c.query('DELETE FROM response WHERE source_id = $1', [sid]);
      await tombstone(c, sid, 'common', round.id, client.id);
    });
    const m = await run();
    expect(m.counts.common).toEqual({ accepted: 0, existing: 39, suppressed: 1 });
    expect(await withPg((c) => countBySource(c, [sid]))).toEqual({});
  });

  it('the manifest has no initials', async () => {
    const m = await prisma.importManifest.findUniqueOrThrow({ where: { id: first.id ?? '' } });
    const text = JSON.stringify(m);
    for (const r of RECORDS) expect(text).not.toContain(r.init);
    expect(m.source).toBe('runde1');
  });
});
