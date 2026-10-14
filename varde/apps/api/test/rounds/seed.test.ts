// Task 1.7 (integration): seed of clients and import rounds on the synthetic fixtures; old
// kartlegging links → «avslutta», codes stored only as sha256 and never logged.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap.js';
import { IMPORT_ROUNDS, legacyHash, SeedService } from '../../src/modules/rounds/seed.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { captureOutput, type Captured } from '../support/capture-output.js';
import { clients, kundar, tilgang } from '../support/fixtures.js';
import { SEED_DIR } from '../support/seed-dir.js';

let app: NestFastifyApplication;
let out: Captured;
let prisma: PrismaService;
let first: Awaited<ReturnType<SeedService['seedAll']>>;
let second: Awaited<ReturnType<SeedService['seedAll']>>;
const input = () => ({
  clients: clients(),
  kundar: kundar(),
  tilgang: tilgang(),
  seedDir: SEED_DIR,
  who: 'test:seed',
});

beforeAll(async () => {
  out = captureOutput();
  app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
  first = await app.get(SeedService).seedAll(input());
  second = await app.get(SeedService).seedAll(input());
});

afterAll(async () => {
  await app.close();
  out.restore();
});

const roundsOf = () =>
  prisma.round.findMany({
    where: { name: { in: IMPORT_ROUNDS.map((r) => r.name) } },
    include: { round_clients: true, template_version: { include: { template: true } } },
  });

describe('seed of kartlegging (1.7)', () => {
  it('two runs give the same totals; the second is unchanged', () => {
    const total = (c: { created: number; updated: number; unchanged: number }) =>
      c.created + c.updated + c.unchanged;
    expect(total(second.clients)).toBe(total(first.clients));
    expect(second.clients).toEqual({ created: 0, updated: 0, unchanged: 6 });
    expect(second.templates).toEqual({ created: 0, updated: 0, unchanged: 4 });
    expect(second.rounds).toEqual({ created: 0, updated: 0, unchanged: 3 });
    expect(second.roundClients).toEqual({ created: 0, updated: 0, unchanged: 18 });
    expect(second.legacyHashes).toBe(first.legacyHashes);
  });

  it('6 clients with employee_count from kundar.json; 6 RoundClients in each import round', async () => {
    const found = await prisma.client.findMany({ where: { slug: { in: Object.keys(kundar()) } } });
    expect(found).toHaveLength(6);
    expect(found.find((c) => c.slug === 'sfhs')?.employee_count).toBeNull();
    expect(found.find((c) => c.slug === 'daco')?.employee_count).toBe(25);
    const rounds = await roundsOf();
    expect(rounds).toHaveLength(3);
    for (const r of rounds) expect(r.round_clients, r.name).toHaveLength(6);
  });

  it('legacy_code_hash = sha256 of the fixture code; the code column stays empty', async () => {
    const codes = tilgang();
    for (const r of (await roundsOf()).filter((x) => x.type === 'regular')) {
      const byClient = await prisma.roundClient.findMany({
        where: { round_id: r.id },
        include: { client: true },
      });
      for (const rc of byClient) {
        expect(rc.legacy_code_hash).toBe(legacyHash(codes[rc.client.slug] ?? ''));
        expect(rc.code).toBeNull();
        expect(rc.status).toBe('closed');
      }
    }
    const r1 = (await roundsOf()).find((x) => x.type === 'external_import')!;
    expect(r1.round_clients.every((rc) => rc.legacy_code_hash === null)).toBe(true);
  });

  it('the three import rounds: identification initials, template version set, round 1 on runde1-forms', async () => {
    const rounds = await roundsOf();
    expect(
      rounds
        .map((r) => [r.identification, r.template_version?.template.key, r.template_version?.label])
        .sort(),
    ).toEqual([
      ['initials', 'ki', '2026-10-13'],
      ['initials', 'tryggleik', '2026-10-13'],
      ['initials', 'tryggleik', 'runde1-forms-2026-01'],
    ]);
    const r1 = rounds.find((r) => r.type === 'external_import')!;
    expect(r1.template_version?.origin).toBe('external_import');
    const rc = r1.round_clients.find((x) => x.population_snapshot === 30);
    expect(rc?.deadline?.toISOString().slice(0, 10)).toBe('2027-06-30');
  });

  it('/r/legacy with the fixture code → 200 «avslutta»; a foreign code → 404', async () => {
    const t = tilgang().daco ?? '';
    const ok = await app.inject({ method: 'GET', url: `/r/legacy?s=tryggleik&k=daco&t=${t}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain('Kartlegginga er avslutta. Takk for at du ville svare.');
    expect(ok.headers['referrer-policy']).toBe('no-referrer');
    expect(String(ok.headers['content-security-policy'])).toContain("default-src 'none'");
    const ki = await app.inject({ method: 'GET', url: `/r/legacy?s=ki&k=daco&t=${t}` });
    expect(ki.statusCode).toBe(200);
    const foreign = await app.inject({
      method: 'GET',
      url: `/r/legacy?s=tryggleik&k=gasta&t=${t}`,
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.body).toContain('Lenkja er ikkje gyldig');
  });

  it('log lines of both requests carry no t= and no code', () => {
    const t = tilgang().daco ?? '';
    const lines = out.lines().filter((l) => l.includes('/r/legacy'));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of out.lines()) {
      expect(l).not.toContain('t=');
      expect(l).not.toContain(t);
    }
  });
});
