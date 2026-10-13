// Task 1.11 (integration): completeness of snapshots (ADR-020, ADR-025). Import → release → the
// cell model from released snapshots equals the calculation from raw; after TRUNCATE response
// the snapshots are unchanged and class `rows` is empty (with an AuditLog entry) — expected.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { POPULATIONS } from '@varde/schema/metrics/populations';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap.js';
import { Runde1ImportService } from '../../src/modules/imports/runde1-import.js';
import { SvarImportService } from '../../src/modules/imports/svar-import.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import {
  type ComputedCell,
  PrivacyService,
  type PrivacySession,
} from '../../src/modules/privacy/privacy.service.js';
import { SeedService } from '../../src/modules/rounds/seed.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { clients, fixtureText, kundar, tilgang } from '../support/fixtures.js';
import { released, type Snap } from '../support/golden.js';
import { IMPORT_ROUND_NAMES, resetImports } from '../support/imports.js';
import { withPg } from '../support/rounds.js';
import { SEED_DIR } from '../support/seed-dir.js';

let app: NestFastifyApplication;
let prisma: PrismaService;
let privacy: PrivacyService;
let metrics: MetricsService;
const rounds: { id: string; name: string }[] = [];
const before = new Map<string, Map<string, Snap>>();
const MARK = `inv1a-${Date.now().toString(36)}`;
const session: PrivacySession = { sid: 's', oid: MARK, name: 'Test Admin', via: 'entra' };

async function rawCells(round: string): Promise<Map<string, ComputedCell>> {
  const defs = await metrics.definitionsFor(round);
  const rcs = await prisma.roundClient.findMany({
    where: { round_id: round },
    include: { client: true },
  });
  const out = new Map<string, ComputedCell>();
  for (const population of POPULATIONS) {
    const cells =
      population === 'round_client'
        ? (
            await Promise.all(
              rcs.map((rc) => privacy.computeCells(round, population, defs, rc.client.slug)),
            )
          ).flat()
        : await privacy.computeCells(round, population, defs);
    for (const c of cells) out.set(`${population}|${c.client ?? ''}|${c.metric_key}|${c.group}`, c);
  }
  return out;
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
  privacy = app.get(PrivacyService);
  metrics = app.get(MetricsService);
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
  await app
    .get(SvarImportService)
    .importSvar(fixtureText('svar.synthetic.jsonl'), { who: 'test:1a' });
  await app
    .get(Runde1ImportService)
    .importRunde1(fixtureText('runde1.synthetic.js'), { who: 'test:1a' });
  await metrics.closeImported(SEED_DIR);
  for (const name of IMPORT_ROUND_NAMES) {
    const r = await prisma.round.findFirstOrThrow({ where: { name } });
    rounds.push({ id: r.id, name });
  }
}, 180_000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { who: `entra:${MARK}` } });
  await resetImports(prisma);
  await app.close();
});

describe('invariants 1a: completeness of snapshots', () => {
  it('every released cell that is not suppressed equals the calculation from raw', async () => {
    let compared = 0;
    for (const r of rounds) {
      const snaps = await released(r.id);
      before.set(r.id, snaps);
      const raw = await rawCells(r.id);
      expect(snaps.size, r.name).toBe(raw.size);
      for (const [key, s] of snaps) {
        const c = raw.get(key);
        expect(c, key).toBeDefined();
        if (s.suppressed) {
          expect([s.n, s.numerator, s.denominator]).toEqual([0, 0, 0]);
          continue;
        }
        // numerator is float8 (hours of KI blocks): equal within float precision.
        expect([s.n, s.denominator], key).toEqual([c!.n, c!.denominator]);
        expect(Math.abs(s.numerator - c!.numerator), key).toBeLessThan(1e-9);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it('after TRUNCATE response the snapshots are unchanged and rows are empty with an AuditLog entry', async () => {
    await withPg((c) => c.query('TRUNCATE response'));
    for (const r of rounds) {
      const now = await released(r.id);
      expect(now, r.name).toEqual(before.get(r.id));
      const rows = await privacy.rows({ round: r.id }, session);
      expect(rows.rows).toEqual([]);
    }
    const audit = await prisma.auditLog.findMany({
      where: { who: `entra:${MARK}`, what: 'privacy.rows' },
    });
    expect(audit).toHaveLength(rounds.length);
    expect(audit.every((a) => (a.details as { count: number }).count === 0)).toBe(true);
  });
});
