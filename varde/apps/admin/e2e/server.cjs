/* eslint-disable @typescript-eslint/no-require-imports -- API runs in its own CommonJS process on Node 22 */
'use strict';
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');

require(require.resolve('reflect-metadata', { paths: [resolve(__dirname, '../../api')] }));

(async () => {
  const { createApp } = require('../../api/dist/bootstrap.js');
  const { PrismaService } = require('../../api/dist/prisma/prisma.service.js');
  const { RoundsService } = require('../../api/dist/modules/rounds/rounds.service.js');
  const { SeedTemplatesService } = require('../../api/dist/modules/surveys/seed-templates.js');
  const { PrivacyService } = require('../../api/dist/modules/privacy/privacy.service.js');
  const { MetricsService } = require('../../api/dist/modules/metrics/metrics.service.js');
  const { EventsService } = require('../../api/dist/modules/events/events.service.js');
  const app = await createApp();
  const db = app.get(PrismaService),
    rounds = app.get(RoundsService);
  const stateFile = process.env.ADMIN_E2E_STATE_FILE;
  let state;
  if (existsSync(stateFile)) state = JSON.parse(readFileSync(stateFile, 'utf8'));
  else {
    const seed = resolve(__dirname, '../../../config/seed');
    await app.get(SeedTemplatesService).seedTemplates(seed, 'test:admin-e2e');
    await app.get(MetricsService).seedMetrics(seed);
    const version = await db.templateVersion.findFirstOrThrow({
      where: { template: { key: 'tryggleik' }, label: '2026-10-13', status: 'published' },
    });
    const mark = `e2e-admin-${randomUUID()}`;
    const client = await db.client.create({
      data: { slug: mark, name: 'Syntetisk admin kunde', employee_count: 12 },
    });
    state = { mark, client: client.id, version: version.id, rounds: {} };
    for (const label of ['lifecycle', 'progress', 'hidden', 'unknown', 'sse', 'dashboard']) {
      const round = await rounds.create(
        { name: `${mark}-${label}`, template_version_id: version.id },
        'test:admin-e2e',
      );
      const rc = await rounds.addClient(
        round.id,
        { client_id: client.id, deadline: '2099-06-01' },
        'test:admin-e2e',
      );
      const issued = await rounds.openClient(rc.id, 'test:admin-e2e');
      if (label === 'unknown')
        await db.roundClient.update({ where: { id: rc.id }, data: { population_snapshot: null } });
      state.rounds[label] = { id: round.id, rc: rc.id, name: round.name, code: issued.code };
    }
    const other = await db.client.create({
      data: { slug: `${mark}-other`, name: 'Syntetisk andre kunde', employee_count: 6 },
    });
    state.other_client = other.id;
    const extra = await rounds.addClient(
      state.rounds.dashboard.id,
      { client_id: other.id, deadline: '2099-06-01' },
      'test:admin-e2e',
    );
    const issuedExtra = await rounds.openClient(extra.id, 'test:admin-e2e');
    state.rounds.dashboard_extra = {
      ...state.rounds.dashboard,
      rc: extra.id,
      code: issuedExtra.code,
    };
    const baseline = await db.round.create({
      data: {
        name: `${mark}-baseline`,
        type: 'external_import',
        status: 'closed',
        identification: 'initials',
        template_version_id: version.id,
        created_at: new Date('2026-01-01'),
        closed_at: new Date('2026-01-02'),
      },
    });
    for (const c of [client, other]) {
      const rc = await db.roundClient.create({
        data: { round_id: baseline.id, client_id: c.id, status: 'closed', population_snapshot: 6 },
      });
      const parts = [0, 1, 2].map((i) => ({
        round_client_id: rc.id,
        part: 'common',
        role: 'kontor',
        lang: 'nn',
        respondent_key: `ZZTEST${String.fromCharCode(65 + i)}`,
        answers: { F8: 'nei', F12: 'ja', F5: 'ja', F14: 'ja' },
        free: {},
        submission_id: randomUUID(),
        content_hash: '0'.repeat(64),
        source_id: null,
        duration_s: null,
        submitted_day: '2026-01-02',
      }));
      await db.$transaction((tx) => app.get(PrivacyService).store.insertParts(tx, parts));
    }
    await app.get(MetricsService).releaseRound(baseline.id, { type: 'auto', who: 'system' });
    writeFileSync(stateFile, JSON.stringify(state));
  }
  const server = app.getHttpAdapter().getInstance();
  // Test-only instrumentation in this child entry; never registered in production.
  server.get('/__e2e/state', () => ({ ...state, connections: app.get(EventsService).connections }));
  server.post('/__e2e/age/:label', async (request, reply) => {
    const fixture = state.rounds[request.params.label];
    if (!fixture) return reply.status(404).send();
    await db.progressEvent.updateMany({
      where: { round_client_id: fixture.rc },
      data: { at: new Date(Date.now() - 31 * 60_000) },
    });
    app.get(EventsService).changed('progress');
    return { ok: true };
  });
  await app.listen(Number(process.env.PORT), '127.0.0.1');
  process.stdout.write('READY\n');
  process.on('SIGTERM', () => {
    void (async () => {
      const ids = (
        await db.round.findMany({
          where: { name: { startsWith: state.mark } },
          select: { id: true },
        })
      ).map((r) => r.id);
      for (const id of ids) {
        await db.$executeRaw`DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = ${id}::uuid)`;
        await db.progressEvent.deleteMany({ where: { round_client: { round_id: id } } });
        await db.roundClient.deleteMany({ where: { round_id: id } });
        await db.round.delete({ where: { id } });
      }
      await db.client.deleteMany({ where: { id: { in: [state.client, state.other_client] } } });
      await app.close();
    })().finally(() => process.exit(0));
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
