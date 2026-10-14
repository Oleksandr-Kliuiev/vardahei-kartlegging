// Built API + synthetic seed/import fixtures, no Docker and no real data.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

export default async function setup() {
  const workspace = resolve(import.meta.dirname, '../../..');
  const api = resolve(workspace, 'apps/api');
  const fixtures = resolve(workspace, 'tools/parity/fixtures');
  createRequire(resolve(api, 'package.json'))('reflect-metadata');
  const run = (args) => execFileSync('pnpm', args, { cwd: workspace, stdio: 'pipe' });
  run(['--filter', '@varde/api', 'db:migrate']);
  run(['--filter', '@varde/api...', 'build']);
  run(['--filter', '@varde/runner', 'build']);
  const cli = (args) => execFileSync(process.execPath, [resolve(api, 'dist/cli.js'), ...args], {
    cwd: api, stdio: 'pipe',
  });
  cli(['seed', '--clients', resolve(workspace, 'config/seed/clients.json'), '--kundar', resolve(fixtures, 'kundar.json'), '--tilgang', resolve(fixtures, 'tilgang.json')]);
  cli(['import', 'svar', '--file', resolve(fixtures, 'svar.synthetic.jsonl')]);
  cli(['import', 'runde1', '--file', resolve(fixtures, 'runde1.synthetic.js')]);
  const { createApp } = await import('../../api/dist/bootstrap.js');
  const { RoundsService } = await import('../../api/dist/modules/rounds/rounds.service.js');
  const { PrismaService } = await import('../../api/dist/prisma/prisma.service.js');
  const app = await createApp();
  const db = app.get(PrismaService);
  const service = app.get(RoundsService);
  const state = {};
  const ids = [];
  try {
    const version = await db.templateVersion.findFirstOrThrow({ where: { template: { key: 'ki' }, label: '2026-10-13', status: 'published' } });
    const client = await db.client.findFirstOrThrow();
    for (const [label, lang] of [['nn', 'nn'], ['en', 'en'], ['closed', 'nn']]) {
      const round = await service.create({ name: `e2e-${label}`, template_version_id: version.id }, 'test:e2e');
      ids.push(round.id);
      const testClient = await db.client.create({ data: { slug: `e2e-${round.id}`, name: 'Syntetisk kunde', default_lang: lang } });
      const rc = await service.addClient(round.id, { client_id: testClient.id, population_snapshot: client.employee_count ?? 12, deadline: '2099-06-01' }, 'test:e2e');
      const opened = await service.openClient(rc.id, 'test:e2e');
      if (label === 'closed') await service.closeClient(rc.id, 'test:e2e');
      state[label] = { code: opened.code, version: version.id };
    }
    const origin = new URL(process.env.RUNNER_BASE_URL ?? 'http://127.0.0.1:3098');
    await app.listen(Number(origin.port), origin.hostname);
    const dir = resolve(import.meta.dirname, '../test-results');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'rounds.json'), JSON.stringify(state));
    return async () => {
      for (const id of ids) {
        await db.roundClient.deleteMany({ where: { round_id: id } });
        await db.round.delete({ where: { id } });
        await db.client.deleteMany({ where: { slug: `e2e-${id}` } });
      }
      await app.close();
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}
