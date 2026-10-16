// Rounds of seminars in integration tests (3.8, 3.9): synthetic published versions, rounds of a
// type and status on given clients, and their cleanup. Everything carries the mark of the test file;
// answers are removed with plain `pg` (outside modules/privacy nothing touches `response` via Prisma).
import { randomUUID } from 'node:crypto';
import type { SeminarApp } from './seminars.js';
import { withPg } from './rounds.js';

/** A published version of a new template (content as given, its key set to the template's). */
export async function surveyVersion(
  t: SeminarApp,
  audience: 'client_survey' | 'seminar_after' | 'seminar_live' = 'client_survey',
  content: Record<string, unknown> = {},
): Promise<string> {
  const key = `${t.mark}-s${randomUUID().slice(0, 6)}`;
  const template = await t.prisma.surveyTemplate.create({
    data: { key, audience, required_languages: ['nn', 'en'] },
  });
  const v = await t.prisma.templateVersion.create({
    data: {
      template_id: template.id,
      label: 'v1',
      version_no: 1,
      identification: 'none',
      required_languages: ['nn', 'en'],
      content: { ...content, key },
      origin: 'authored',
      content_hash: '0'.repeat(64),
      status: 'published',
      published_at: new Date(),
      published_by: t.mark,
    },
  });
  return v.id;
}

/** A round of `type` on `clients` (ids), named with the mark so that cleanup finds it. */
export async function survey(
  t: SeminarApp,
  opts: {
    type: 'regular' | 'post_seminar' | 'external_import';
    status: 'draft' | 'open' | 'closed';
    clients: string[];
    version: string;
    name?: string;
    identification?: 'initials' | 'none';
  },
): Promise<string> {
  const r = await t.prisma.round.create({
    data: {
      name: `${t.mark} ${opts.name ?? opts.type}`,
      type: opts.type,
      status: opts.status,
      template_version_id: opts.version,
      identification: opts.status === 'draft' ? null : (opts.identification ?? 'none'),
      opened_at: opts.status === 'draft' ? null : new Date(),
      closed_at: opts.status === 'closed' ? new Date() : null,
    },
  });
  for (const client_id of opts.clients)
    await t.prisma.roundClient.create({
      data: { round_id: r.id, client_id, status: opts.status, population_snapshot: 10 },
    });
  return r.id;
}

/** Rounds of this file (named with the mark): answers, progress, round clients, the rounds. The
 * links of seminars go with them (ON DELETE SET NULL); released snapshots stay (no foreign key). */
export async function cleanupRounds(t: SeminarApp) {
  await withPg(async (c) => {
    const ids = (
      await c.query<{ id: string }>('SELECT id FROM round WHERE name LIKE $1', [`${t.mark}%`])
    ).rows.map((r) => r.id);
    for (const id of ids) {
      await c.query(
        'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = $1)',
        [id],
      );
      await c.query(
        'DELETE FROM progress_event WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = $1)',
        [id],
      );
      await c.query('DELETE FROM round_client WHERE round_id = $1', [id]);
      await c.query('DELETE FROM round WHERE id = $1', [id]);
    }
  });
}
