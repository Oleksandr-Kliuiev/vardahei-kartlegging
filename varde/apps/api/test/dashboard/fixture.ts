import type { RouteOptions } from 'fastify';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { SvarImportService } from '../../src/modules/imports/svar-import.js';
import { Runde1ImportService } from '../../src/modules/imports/runde1-import.js';
import { SeedService } from '../../src/modules/rounds/seed.service.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { startApp } from '../support/auth-app.js';
import { clients, kundar, tilgang, fixtureText } from '../support/fixtures.js';
import { resetImports } from '../support/imports.js';
import { SEED_DIR } from '../support/seed-dir.js';

export async function dashboardFixture(onRoute?: (route: RouteOptions) => void) {
  const t = await startApp({}, onRoute);
  const prisma = t.app.get(PrismaService);
  await t.app.get(SeedService).seedAll({
    clients: clients(),
    kundar: kundar(),
    tilgang: tilgang(),
    seedDir: SEED_DIR,
    who: 'test:dashboard',
  });
  await resetImports(prisma);
  await t.app
    .get(SvarImportService)
    .importSvar(fixtureText('svar.synthetic.jsonl'), { who: 'test:dashboard' });
  await t.app
    .get(Runde1ImportService)
    .importRunde1(fixtureText('runde1.synthetic.js'), { who: 'test:dashboard' });
  await t.app.get(MetricsService).closeImported(SEED_DIR);
  const rounds = await prisma.round.findMany({
    where: {
      name: {
        in: [
          'Runde 2 IT-tryggleik',
          'KI runde 1',
          'KI 2026-10-12 (anonym)',
          'Runde 1 (Forms, januar 2026)',
        ],
      },
    },
  });
  const id = (name: string) => rounds.find((r) => r.name === name)!.id;
  const session = await t.store.create({
    oid: 'test:dashboard-reader',
    name: 'Syntetisk admin',
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const cookie = { varde_session: t.app.getHttpAdapter().getInstance().signCookie(session.sid) };
  return {
    ...t,
    prisma,
    session,
    cookie,
    tryggleik: id('Runde 2 IT-tryggleik'),
    ki: id('KI runde 1'),
    anon: id('KI 2026-10-12 (anonym)'),
    runde1: id('Runde 1 (Forms, januar 2026)'),
    async close() {
      await resetImports(prisma);
      await t.app.close();
    },
  };
}
export type DashboardFixture = Awaited<ReturnType<typeof dashboardFixture>>;
