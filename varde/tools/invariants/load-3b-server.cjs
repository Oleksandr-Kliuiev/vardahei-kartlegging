/* eslint-disable @typescript-eslint/no-require-imports -- the built API runs as its own CommonJS process (Node 22) */
// Server of the live poll load test (3.7): the built API (apps/api/dist) on the database of
// DATABASE_URL, with a synthetic seminar of today, its live poll (apps/api/test/support/live-template.json)
// and a presenter key. Prints one JSON line {ready, code, key} and serves until SIGTERM, then removes
// what it made. Run by load-3b.mjs; never against a database with real data.
'use strict';
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const API = resolve(__dirname, '../../apps/api');
require(require.resolve('reflect-metadata', { paths: [API] }));

(async () => {
  const { createApp } = require(`${API}/dist/bootstrap.js`);
  const { PrismaService } = require(`${API}/dist/prisma/prisma.service.js`);
  const { SeminarsService } = require(`${API}/dist/modules/seminars/seminars.service.js`);
  const { LivePollService } = require(`${API}/dist/modules/live/live-poll.service.js`);
  const { PresenterTokenService } = require(`${API}/dist/modules/live/presenter-token.service.js`);
  const app = await createApp();
  const db = app.get(PrismaService);
  const mark = `load-3b-${Date.now().toString(36)}`;
  const who = 'test:load-3b';
  const content = JSON.parse(readFileSync(`${API}/test/support/live-template.json`, 'utf8'));
  content.key = mark;
  const template = await db.surveyTemplate.create({
    data: { key: mark, audience: 'seminar_live', required_languages: ['nn', 'en'] },
  });
  const version = await db.templateVersion.create({
    data: {
      template_id: template.id,
      label: 'v1',
      version_no: 1,
      identification: 'none',
      required_languages: ['nn', 'en'],
      content,
      origin: 'authored',
      content_hash: '0'.repeat(64),
      status: 'published',
      published_at: new Date(),
      published_by: who,
    },
  });
  const day = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const seminar = await app.get(SeminarsService).create(
    {
      topic_nn: `Lasttest ${mark}`,
      topic_en: null,
      date: `${day.year}-${day.month}-${day.day}`,
      start: '00:30',
      end: '23:30',
      place: 'Lasttest',
      format: 'onsite',
      languages: ['nn'],
      clients: [],
    },
    who,
  );
  const live = await app.get(LivePollService).create(seminar, version.id, who);
  const issued = await app.get(PresenterTokenService).issue(seminar, who);
  const rc = await db.roundClient.findFirstOrThrow({ where: { round_id: live.round } });
  await app.listen(Number(process.env.PORT), '127.0.0.1');
  process.stdout.write(
    `${JSON.stringify({ ready: true, code: rc.code, key: new URL(issued.link).hash.slice(3) })}\n`,
  );
  const cleanup = async () => {
    // Synthetic load data only: the answers, the round, the seminar and its key (cascade).
    await db.seminar.update({ where: { id: seminar }, data: { round_live_id: null } });
    await db.$executeRaw`DELETE FROM response WHERE round_client_id = ${rc.id}::uuid`;
    await db.roundClient.delete({ where: { id: rc.id } });
    await db.round.delete({ where: { id: live.round } });
    await db.seminar.delete({ where: { id: seminar } });
    await app.close();
  };
  process.on('SIGTERM', () => {
    void cleanup().finally(() => process.exit(0));
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
