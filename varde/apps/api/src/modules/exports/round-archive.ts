// Round archive (5.2): one closed round as a JSON file of aggregates and their definitions —
// round metadata without link codes, the published template version (labels and scores the
// dashboard reads), clients (slug, name) and RoundClients, released and superseded snapshots,
// MetricDefinitions, FindingRules, Findings, the metric set, the release history and a sha256 of
// the canonical content. Never Response, respondent_key, initials, answers or free text.
import { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import { POPULATIONS } from '@varde/schema/metrics/populations';
import { z } from 'zod';
import { FindingRule } from '../findings/finding-rule.js';
import { ArchivedSnapshot } from '../privacy/privacy.service.js';
import { canonical, sha256 } from '../surveys/hashes.js';

export const ARCHIVE_FORMAT = 'varde.round-archive';
export const ARCHIVE_VERSION = 1;

const Day = z.iso.date();
const Stamp = z.iso.datetime({ offset: true });
const Version = z.number().int().positive();

export const RoundArchive = z.strictObject({
  format: z.literal(ARCHIVE_FORMAT),
  format_version: z.literal(ARCHIVE_VERSION),
  exported_at: Day,
  round: z.strictObject({
    id: z.uuid(),
    name: z.string().min(1),
    type: z.enum(['regular', 'post_seminar', 'live', 'external_import']),
    status: z.enum(['closed', 'archived']),
    identification: z.enum(['initials', 'none']),
    created_at: Stamp,
    opened_at: Stamp.nullable(),
    closed_at: Stamp.nullable(),
    template_version_id: z.uuid(),
  }),
  template: z.strictObject({
    id: z.uuid(),
    key: z.string().min(1),
    audience: z.enum(['client_survey', 'seminar_live', 'seminar_after']),
    required_languages: z.array(z.enum(['nn', 'en', 'nb'])),
  }),
  template_version: z.strictObject({
    id: z.uuid(),
    template_id: z.uuid(),
    label: z.string().min(1),
    version_no: Version,
    identification: z.enum(['initials', 'none']),
    required_languages: z.array(z.enum(['nn', 'en', 'nb'])),
    origin: z.enum(['authored', 'kartlegging', 'external_import']),
    content_hash: z.string().min(1),
    published_at: Stamp,
    content: z.record(z.string(), z.unknown()),
  }),
  clients: z.array(
    z.strictObject({ id: z.uuid(), slug: z.string().min(1), name: z.string().min(1) }),
  ),
  round_clients: z.array(
    z.strictObject({
      id: z.uuid(),
      client_id: z.uuid(),
      status: z.enum(['draft', 'open', 'closed', 'archived']),
      deadline: Day.nullable(),
      population_snapshot: z.number().int().nullable(),
    }),
  ),
  metric_definitions: z.array(
    z.strictObject({ key: z.string().min(1), version: Version, definition: MetricDefinition }),
  ),
  finding_rules: z.array(
    z.strictObject({
      key: z.string().min(1),
      version: Version,
      channel: z.enum(['aggregate', 'leader']),
      definition: FindingRule,
    }),
  ),
  round_metric_set: z
    .strictObject({ metric_keys: z.array(z.string()), fixed_at: Stamp })
    .nullable(),
  snapshots: z.array(ArchivedSnapshot),
  findings: z.array(
    z.strictObject({
      id: z.uuid(),
      client_id: z.uuid().nullable(),
      rule_key: z.string().min(1),
      rule_version: Version,
      numbers: z.strictObject({
        n: z.number(),
        count: z.number(),
        share: z.number(),
        level: z.enum(['medium', 'high']),
      }),
      release_id: z.uuid(),
    }),
  ),
  releases: z.array(
    z.strictObject({
      release_id: z.uuid(),
      population: z.enum(POPULATIONS),
      status: z.enum(['released', 'superseded']),
      released_at: Day.nullable(),
      superseded_at: Stamp.nullable(),
      superseded_reason: z.string().nullable(),
      cells: z.number().int().nonnegative(),
      suppressed: z.number().int().nonnegative(),
      stale: z.number().int().nonnegative(),
    }),
  ),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RoundArchive = z.infer<typeof RoundArchive>;
export type ArchiveBody = Omit<RoundArchive, 'sha256'>;

/** sha256 of the canonical content (sorted keys, everything except the hash itself). */
export const archiveHash = (body: ArchiveBody): string => sha256(canonical(body));

/** The parts a restore writes; a repeated restore compares exactly these. */
export function restorable(a: ArchiveBody): string {
  return canonical({
    round: a.round,
    template: a.template,
    template_version: a.template_version,
    clients: a.clients,
    round_clients: a.round_clients,
    metric_definitions: a.metric_definitions,
    finding_rules: a.finding_rules,
    round_metric_set: a.round_metric_set,
    snapshots: a.snapshots,
    findings: a.findings,
  });
}

/** History of releases, derived from the snapshot rows (one release = one population). */
export function releasesOf(snapshots: readonly ArchivedSnapshot[]): RoundArchive['releases'] {
  const by = new Map<string, ArchivedSnapshot[]>();
  for (const s of snapshots) by.set(s.release_id, [...(by.get(s.release_id) ?? []), s]);
  return [...by.entries()]
    .map(([release_id, cells]) => {
      const first = cells[0]!;
      return {
        release_id,
        population: first.population,
        status: first.status,
        released_at: first.released_at,
        superseded_at: first.superseded_at,
        superseded_reason: first.superseded_reason,
        cells: cells.length,
        suppressed: cells.filter((c) => c.suppressed).length,
        stale: cells.filter((c) => c.stale).length,
      };
    })
    .sort(
      (a, b) =>
        (a.released_at ?? '').localeCompare(b.released_at ?? '') ||
        (a.superseded_at ?? '9').localeCompare(b.superseded_at ?? '9') ||
        a.population.localeCompare(b.population) ||
        a.release_id.localeCompare(b.release_id),
    );
}
