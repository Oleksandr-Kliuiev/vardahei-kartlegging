/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS child process, see the comment below */
// Runs as a CHILD process (CommonJS entry, like the API itself): loading the API inside the
// Playwright process breaks `jose` (require(esm)) on Node 22. Seeds the e2e rounds, listens, and
// cleans up on SIGTERM. Disposable synthetic e2e database only.
'use strict';
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

require(require.resolve('reflect-metadata', { paths: [resolve(__dirname, '../../api')] }));

(async () => {
  const { createApp } = require('../../api/dist/bootstrap.js');
  const { RoundsService } = require('../../api/dist/modules/rounds/rounds.service.js');
  const { PrismaService } = require('../../api/dist/prisma/prisma.service.js');
  const app = await createApp();
  const db = app.get(PrismaService);
  const service = app.get(RoundsService);
  const state = {};
  const ids = [];
  try {
    const client = await db.client.findFirstOrThrow();
    for (const [label, lang, key, versionLabel] of [
      ['nn', 'nn', 'ki', '2026-10-13'], ['en', 'en', 'ki', '2026-10-13'], ['closed', 'nn', 'ki', '2026-10-13'],
      ['anonymous', 'nn', 'ki', '2026-10-12'], ['security', 'nn', 'tryggleik', '2026-10-13'],
    ]) {
      const version = await db.templateVersion.findFirstOrThrow({ where: { template: { key }, label: versionLabel, status: 'published' } });
      const round = await service.create({ name: `e2e-${label}`, template_version_id: version.id }, 'test:e2e');
      ids.push(round.id);
      const testClient = await db.client.create({ data: { slug: `e2e-${round.id}`, name: 'Syntetisk kunde', default_lang: lang } });
      const rc = await service.addClient(round.id, { client_id: testClient.id, population_snapshot: Math.max(100, client.employee_count ?? 12), deadline: '2099-06-01' }, 'test:e2e');
      const opened = await service.openClient(rc.id, 'test:e2e');
      if (label === 'closed') await service.closeClient(rc.id, 'test:e2e');
      state[label] = { code: opened.code, version: version.id, roundClient: rc.id };
    }
    // Seminar page (3a): one coming seminar (nn and en, two clients) and one held with material.
    const { SeminarsService } = require('../../api/dist/modules/seminars/seminars.service.js');
    const { MaterialsService } = require('../../api/dist/modules/seminars/materials.service.js');
    const seminars = app.get(SeminarsService);
    const mark = `e2e-sem-${Date.now().toString(36)}`;
    const semClients = [];
    for (const name of ['Syntetisk Gasta', 'Syntetisk Daco'])
      semClients.push((await db.client.create({ data: { slug: `${mark}-${semClients.length}`, name } })).id);
    const base = { start: '09:00', end: '11:30', format: 'onsite', clients: semClients };
    const open = await seminars.create({ ...base, topic_nn: 'Passord og MFA i kvardagen', topic_en: 'Passwords and MFA at work', date: '2099-11-05', place: 'Vardahei IT, Sogndal', languages: ['nn', 'en'] }, 'test:e2e-seminar');
    const held = await seminars.create({ ...base, topic_nn: 'Backup som faktisk verkar', topic_en: null, date: '2020-09-03', place: 'Teams', format: 'digital', languages: ['nn'], clients: [] }, 'test:e2e-seminar');
    await app.get(MaterialsService).add(held, { title: 'Lysark frå seminaret', url: 'https://example.test/lysark.pdf' }, 'test:e2e-seminar');
    const codeOf = async (id) => (await db.seminar.findUniqueOrThrow({ where: { id } })).code;
    state.seminar_open = { code: await codeOf(open), version: '', roundClient: '' };
    state.seminar_held = { code: await codeOf(held), version: '', roundClient: '' };
    // Live poll (3b): a seminar of today with a synthetic version made for live questions; question
    // L2 is open, so a phone sees it at once.
    const { LivePollService } = require('../../api/dist/modules/live/live-poll.service.js');
    const liveContent = JSON.parse(readFileSync(resolve(__dirname, '../../api/test/support/live-template.json'), 'utf8'));
    liveContent.key = `${mark}-live`;
    const liveTemplate = await db.surveyTemplate.create({ data: { key: liveContent.key, audience: 'seminar_live', required_languages: ['nn', 'en'] } });
    const liveVersion = await db.templateVersion.create({ data: {
      template_id: liveTemplate.id, label: 'v1', version_no: 1, identification: 'none', required_languages: ['nn', 'en'],
      content: liveContent, origin: 'authored', content_hash: '0'.repeat(64), status: 'published', published_at: new Date(), published_by: 'test:e2e-seminar',
    } });
    const oslo = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    const liveSeminar = await seminars.create({ ...base, clients: [], topic_nn: 'Live-spørsmål på mobilen', topic_en: 'Live questions on the phone', date: `${oslo.year}-${oslo.month}-${oslo.day}`, start: '00:30', end: '23:30', place: 'Vardahei IT, Sogndal', languages: ['nn', 'en'] }, 'test:e2e-seminar');
    const live = await app.get(LivePollService).create(liveSeminar, liveVersion.id, 'test:e2e-seminar');
    await app.get(LivePollService).step(live.round, 'L2', 'open', 'test:e2e-seminar');
    const liveRc = await db.roundClient.findFirstOrThrow({ where: { round_id: live.round } });
    state.live = { code: liveRc.code, version: liveVersion.id, roundClient: liveRc.id };
    ids.push(live.round);
    const origin = new URL(process.env.RUNNER_BASE_URL ?? 'http://127.0.0.1:3098');
    await app.listen(Number(origin.port), origin.hostname);
    const dir = resolve(__dirname, '../test-results');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'rounds.json'), JSON.stringify(state));
    const cleanup = async () => {
      // Disposable synthetic e2e database only: seminars of this run and their contacts.
      await db.$executeRaw`DELETE FROM contact WHERE email LIKE 'zz-e2e-%@example.test'`;
      // The live seminar points at its round: unlink it first, the round goes with the others below.
      await db.seminar.updateMany({ where: { created_by: 'test:e2e-seminar' }, data: { round_live_id: null } });
      await db.seminar.deleteMany({ where: { created_by: 'test:e2e-seminar' } });
      await db.client.deleteMany({ where: { slug: { startsWith: mark } } });
      for (const id of ids) {
        // Disposable synthetic e2e database only. No privacy output is exposed by cleanup.
        await db.$executeRaw`DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = ${id}::uuid)`;
        await db.progressEvent.deleteMany({ where: { round_client: { round_id: id } } });
        await db.roundClient.deleteMany({ where: { round_id: id } });
        await db.round.delete({ where: { id } });
        await db.client.deleteMany({ where: { slug: `e2e-${id}` } });
      }
      await app.close();
    };
    process.on('SIGTERM', () => { void cleanup().finally(() => process.exit(0)); });
    process.stdout.write('READY\n');
  } catch (error) {
    await app.close();
    throw error;
  }
})().catch((error) => { console.error(error); process.exit(1); });
