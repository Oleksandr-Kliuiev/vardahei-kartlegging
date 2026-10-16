// Seminar live poll in tests (3b): a synthetic published `seminar_live` version, a seminar of
// today (Oslo) so that its presenter key works now, the live poll, the presenter key and answers
// sent as a phone would. Everything carries the mark of the test file and goes in cleanup.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { LightMyRequestResponse } from 'fastify';
import type { TemplateContent } from '@varde/schema/template/template';
import { osloParts } from '../../src/modules/seminars/when.js';
import { cleanupSeminars, createSeminar, type SeminarApp } from './seminars.js';
import { withPg } from './rounds.js';

const FIXTURE = new URL('./live-template.json', import.meta.url);

export function liveContent(key = 'seminar-live-test'): TemplateContent {
  return { ...(JSON.parse(readFileSync(FIXTURE, 'utf8')) as TemplateContent), key };
}

/** A published version for live polls (content of live-template.json, changed by `edit`). */
export async function liveVersion(
  t: SeminarApp,
  edit: (c: TemplateContent) => TemplateContent = (c) => c,
): Promise<string> {
  const key = `${t.mark}-live-${randomUUID().slice(0, 6)}`;
  const content = edit(liveContent(key));
  const template = await t.prisma.surveyTemplate.create({
    data: { key, audience: content.audience, required_languages: content.required_languages },
  });
  const version = await t.prisma.templateVersion.create({
    data: {
      template_id: template.id,
      label: 'v1',
      version_no: 1,
      identification: content.identification,
      required_languages: content.required_languages,
      content,
      origin: 'authored',
      content_hash: '0'.repeat(64),
      status: 'published',
      published_at: new Date(),
      published_by: t.mark,
    },
  });
  return version.id;
}

export const todayOslo = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return osloParts(d).date;
};

export interface LivePoll {
  seminar: string;
  round: string;
  code: string;
  version: string;
}

/** A seminar of today with its live poll; the participant code comes from the round client. */
export async function livePoll(t: SeminarApp, date = todayOslo()): Promise<LivePoll> {
  const { id: seminar } = await createSeminar(t, { date, start: '09:00', end: '11:30' });
  const version = await liveVersion(t);
  const res = await t.call('POST', `/api/admin/seminars/${seminar}/live`, {
    template_version_id: version,
  });
  if (res.statusCode !== 201) throw new Error(`create live poll: ${res.statusCode} ${res.body}`);
  const { round } = res.json<{ round: string }>();
  const rc = await t.prisma.roundClient.findFirstOrThrow({ where: { round_id: round } });
  return { seminar, round, code: rc.code!, version };
}

/** The presenter key from the link the admin gets once. */
export async function presenterKey(t: SeminarApp, seminar: string): Promise<string> {
  const res = await t.call('POST', `/api/admin/seminars/${seminar}/presenter`);
  if (res.statusCode !== 201) throw new Error(`issue key: ${res.statusCode} ${res.body}`);
  const link = res.json<{ link: string }>().link;
  return new URL(link).hash.replace(/^#t=/, '');
}

/** A presenter call: the key as a bearer, never a cookie. */
export function presenter(
  t: SeminarApp,
  key: string,
  method: 'GET' | 'POST',
  url: string,
): Promise<LightMyRequestResponse> {
  return t.app
    .getHttpAdapter()
    .getInstance()
    .inject({ method, url, headers: { authorization: `Bearer ${key}` } });
}

/** One phone's answer to one question, through the ordinary Submission API. */
export function answer(
  t: SeminarApp,
  code: string,
  question: string,
  value: unknown,
  over: Record<string, unknown> = {},
  ip = '192.0.2.10',
): Promise<LightMyRequestResponse> {
  return t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'POST',
      url: '/api/runner/submissions',
      headers: { authorization: `Bearer ${code}`, 'x-forwarded-for': `198.51.100.7, ${ip}` },
      payload: {
        submission_id: randomUUID(),
        part: 'common',
        lang: 'nn',
        answers: { [question]: value },
        ...over,
      },
    });
}

/** Live rounds of this file and their answers (plain pg: nothing reads responses through Prisma
 * outside modules/privacy), then the seminars, templates and clients of the mark. */
export async function cleanupLive(t: SeminarApp) {
  await withPg(async (c) => {
    const rounds = (
      await c.query<{ id: string }>(
        `SELECT r.id FROM round r JOIN seminar s ON s.round_live_id = r.id WHERE s.topic_nn LIKE $1`,
        [`%${t.mark}%`],
      )
    ).rows.map((r) => r.id);
    for (const id of rounds) {
      await c.query('UPDATE seminar SET round_live_id = NULL WHERE round_live_id = $1', [id]);
      await c.query(
        'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = $1)',
        [id],
      );
      await c.query('DELETE FROM round_client WHERE round_id = $1', [id]);
      await c.query('DELETE FROM round WHERE id = $1', [id]);
    }
  });
  await cleanupSeminars(t.prisma, t.mark);
}
