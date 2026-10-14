import { randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { LightMyRequestResponse } from 'fastify';
import type { TemplateContent } from '@varde/schema/template/template';
import { CodesService } from '../../src/modules/rounds/codes.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { startApp, type TestApp } from './auth-app.js';
import { runnerRound } from './runner-round.js';
import { withPg } from './rounds.js';
import { seedContent } from './seed-dir.js';

export async function submissionApp() {
  const t = await startApp({ SESSION_SECRET: randomBytes(32).toString('hex') });
  return { ...t, prisma: t.app.get(PrismaService) };
}
export async function submissionRound(
  t: TestApp,
  identification: 'initials' | 'none' = 'initials',
  population = 100,
) {
  const prisma = t.app.get(PrismaService);
  const f = await runnerRound(prisma, `test.submission.${randomUUID()}`, 'draft');
  const content = seedContent(identification === 'none' ? 'ki.2026-10-12' : 'tryggleik.2026-10-13');
  // Fixture version starts published: use a new version to preserve publication immutability.
  const version = await prisma.templateVersion.create({
    data: {
      template_id: f.version.template_id,
      label: 'v2',
      version_no: 2,
      identification,
      required_languages: ['nn', 'en'],
      content: content as Prisma.InputJsonObject,
      origin: 'authored',
      content_hash: '1'.repeat(64),
      status: 'published',
      published_at: new Date(),
      published_by: 'test',
    },
  });
  await prisma.round.update({
    where: { id: f.round.id },
    data: {
      template_version_id: version.id,
      identification,
      status: 'open',
    },
  });
  await prisma.roundClient.update({
    where: { id: f.rc.id },
    data: { status: 'open', population_snapshot: population },
  });
  const rc = await t.app.get(CodesService).reissue(f.rc.id, 'test');
  return { ...f, version, code: rc.code!, content: content as TemplateContent };
}
export const submissionBody = (answers: object = { F1: ' zztest ', F2: 'kontor', F12: 'ja' }) => ({
  submission_id: randomUUID(),
  part: 'common',
  lang: 'nn',
  answers,
});
export function postSubmission(
  t: TestApp,
  code: string,
  payload: object,
  ip = '192.0.2.1',
): Promise<LightMyRequestResponse> {
  return t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'POST',
      url: '/api/runner/submissions',
      headers: { authorization: `Bearer ${code}`, 'x-forwarded-for': `198.51.100.2, ${ip}` },
      payload,
    });
}
export async function storedSubmissions(roundClient: string) {
  return (
    await withPg((c) =>
      c.query<{
        submission_id: string;
        content_hash: string;
        respondent_key: string | null;
        part: string;
        answers: Record<string, unknown>;
        free: Record<string, string>;
        submitted_day: string;
        duration_s: number | null;
      }>(
        'SELECT submission_id, content_hash, respondent_key, part, answers, free, submitted_day::text, duration_s FROM response WHERE round_client_id = $1',
        [roundClient],
      ),
    )
  ).rows;
}
export async function forgetSubmission(prisma: PrismaService, submissionId: string) {
  const request = await prisma.deletionRequest.create({
    data: {
      requested_by: 'test',
      reason: 'synthetic forget',
      scope: 'submissions',
      scope_ref: { ids: [submissionId] },
    },
  });
  await withPg(async (c) => {
    await c.query('BEGIN');
    try {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [submissionId]);
      await c.query(
        `INSERT INTO deletion_tombstone (request_id, submission_id, content_hash, round_id, client_id, part)
        SELECT $1, r.submission_id, r.content_hash, rc.round_id, rc.client_id, r.part
        FROM response r JOIN round_client rc ON rc.id = r.round_client_id WHERE submission_id = $2`,
        [request.id, submissionId],
      );
      await c.query('DELETE FROM response WHERE submission_id = $1', [submissionId]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  });
}
export async function cleanupSubmissions(prisma: PrismaService, rounds: string[]) {
  await withPg((c) =>
    c.query(
      'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = ANY($1::uuid[]))',
      [rounds],
    ),
  );
  await prisma.progressEvent.deleteMany({ where: { round_client: { round_id: { in: rounds } } } });
  await prisma.roundClient.deleteMany({ where: { round_id: { in: rounds } } });
  await prisma.round.deleteMany({ where: { id: { in: rounds } } });
}
