// Rounds of seminars in integration tests (3.8, 3.9): synthetic published versions (also a copy of
// the tryggleik template with its metrics under a key of the file), rounds of a type and status on
// given clients, synthetic answers written through PrivacyService.store, and cleanup. Everything
// carries the mark of the test file; answers are removed with plain `pg` (outside modules/privacy
// nothing touches `response` via Prisma).
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { TemplateContent } from '@varde/schema/template/template';
import { PrivacyService, type ResponsePart } from '../../src/modules/privacy/privacy.service.js';
import type { SeminarApp } from './seminars.js';
import { withPg } from './rounds.js';
import { SEED_DIR, seedContent } from './seed-dir.js';

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

/** The tryggleik content of config/seed (2026-10-13) under a key of this file, changed by `edit`. */
export function scoredContent(
  key: string,
  edit: (c: TemplateContent) => TemplateContent = (c) => c,
) {
  return edit({ ...(seedContent('tryggleik.2026-10-13') as unknown as TemplateContent), key });
}

/** A template of this file (key without a hyphen: metric keys allow none) with the tryggleik
 * metric definitions of config/seed renamed to it, as a seeded template has them. */
export async function scoredTemplate(t: SeminarApp): Promise<{ key: string; id: string }> {
  const key = `${t.mark.replace(/[^a-z0-9]/g, '')}try${randomUUID().slice(0, 4)}`;
  const template = await t.prisma.surveyTemplate.create({
    data: { key, audience: 'client_survey', required_languages: ['nn', 'en'] },
  });
  const seed = JSON.parse(
    readFileSync(join(SEED_DIR, 'metrics', 'tryggleik.json'), 'utf8'),
  ) as Record<string, object>;
  for (const [name, rest] of Object.entries(seed)) {
    const def = MetricDefinition.parse({ key: name.replace(/^tryggleik\./, `${key}.`), ...rest });
    if (def.part !== 'common') continue;
    await t.prisma.metricDefinition.create({
      data: { key: def.key, version: def.version, definition: def },
    });
  }
  return { key, id: template.id };
}

/** A published version `no` of a template of this file. */
export async function scoredVersion(
  t: SeminarApp,
  template: { key: string; id: string },
  no: number,
  edit?: (c: TemplateContent) => TemplateContent,
): Promise<string> {
  const content = scoredContent(template.key, edit);
  const v = await t.prisma.templateVersion.create({
    data: {
      template_id: template.id,
      label: `v${no}`,
      version_no: no,
      identification: 'initials',
      required_languages: ['nn', 'en'],
      content,
      origin: 'authored',
      content_hash: '0'.repeat(64),
      status: 'published',
      published_at: new Date(),
      published_by: t.mark,
    },
  });
  return v.id;
}

/** Synthetic answers of the common part for one round client (keys ZZ…, never real initials). */
export async function answer(
  t: SeminarApp,
  round: string,
  client: string,
  answers: Record<string, unknown>[],
) {
  const rc = await t.prisma.roundClient.findUniqueOrThrow({
    where: { round_id_client_id: { round_id: round, client_id: client } },
  });
  const parts: ResponsePart[] = answers.map((a, i) => ({
    round_client_id: rc.id,
    part: 'common',
    role: 'kontor',
    lang: 'nn',
    respondent_key: `ZZ${client.slice(0, 4).toUpperCase()}${i}`,
    answers: a,
    free: {},
    submission_id: randomUUID(),
    content_hash: '0'.repeat(64),
    source_id: null,
    duration_s: null,
    submitted_day: '2026-10-16',
  }));
  await t.prisma.$transaction((tx) => t.app.get(PrivacyService).store.insertParts(tx, parts));
}
