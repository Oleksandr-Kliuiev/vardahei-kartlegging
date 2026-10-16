// Snapshots in the round archive (5.2): released and superseded cells as stored, read for the
// archive file and written back when the archive is restored into a database "as snapshots".
// Suppressed cells carry no numbers (0c); restore stores them as zeros, as release() does.
// The checks below keep a restore from bringing in what release() would never have published.
import type { Prisma } from '@prisma/client';
import { POPULATIONS } from '@varde/schema/metrics/populations';
import { z } from 'zod';
import { PrivacyViolation } from './types.js';

export class ArchiveRejected extends PrivacyViolation {
  override readonly name: string = 'ArchiveRejected';
}

const Day = z.iso.date();
const Stamp = z.iso.datetime({ offset: true });
const Count = z.number().int().nonnegative();
const Amount = z.number().nonnegative();

/** One snapshot row of the archive; numbers only when the cell is visible. */
export const ArchivedSnapshot = z
  .strictObject({
    id: z.uuid(),
    population: z.enum(POPULATIONS),
    client_id: z.uuid().nullable(),
    round_client_id: z.uuid().nullable(),
    metric_key: z.string().min(1),
    metric_version: z.number().int().positive(),
    group: z.string().min(1),
    suppressed: z.boolean(),
    n: Count.optional(),
    numerator: Amount.optional(),
    denominator: Amount.optional(),
    missing: Count.optional(),
    stale: z.boolean(),
    status: z.enum(['released', 'superseded']),
    computed_at: Day,
    released_at: Day.nullable(),
    superseded_at: Stamp.nullable(),
    superseded_reason: z.string().min(1).nullable(),
    release_id: z.uuid(),
  })
  .superRefine((s, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const numbers = [s.n, s.numerator, s.denominator, s.missing];
    if (s.suppressed && numbers.some((x) => x !== undefined))
      issue('a suppressed cell carries no numbers');
    if (!s.suppressed && numbers.some((x) => x === undefined))
      issue('a visible cell carries n, numerator, denominator and missing');
    if ((s.status === 'superseded') !== (s.superseded_reason !== null))
      issue('superseded cells, and only they, carry a reason');
    if ((s.status === 'superseded') !== (s.superseded_at !== null))
      issue('superseded cells, and only they, carry superseded_at');
    const shape =
      s.population === 'leaders_all'
        ? s.client_id === null && s.round_client_id === null && s.group === 'all'
        : s.population === 'round_client'
          ? s.client_id !== null && s.round_client_id !== null
          : s.client_id === null && s.round_client_id === null;
    if (!shape) issue(`cell does not fit population ${s.population}`);
  });
export type ArchivedSnapshot = z.infer<typeof ArchivedSnapshot>;

type Row = Prisma.AggregateSnapshotGetPayload<object>;
const day = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

export function toArchived(r: Row): ArchivedSnapshot {
  return {
    id: r.id,
    population: r.population as ArchivedSnapshot['population'],
    client_id: r.client_id,
    round_client_id: r.round_client_id,
    metric_key: r.metric_key,
    metric_version: r.metric_version,
    group: r.group,
    suppressed: r.suppressed,
    ...(r.suppressed
      ? {}
      : { n: r.n, numerator: r.numerator, denominator: r.denominator, missing: r.missing }),
    stale: r.stale,
    status: r.status as ArchivedSnapshot['status'],
    computed_at: day(r.computed_at) ?? '',
    released_at: day(r.released_at),
    superseded_at: r.superseded_at?.toISOString() ?? null,
    superseded_reason: r.superseded_reason,
    release_id: r.release_id,
  };
}

export function fromArchived(
  round: string,
  s: ArchivedSnapshot,
): Prisma.AggregateSnapshotCreateManyInput {
  const at = (d: string | null) => (d === null ? null : new Date(`${d}T00:00:00Z`));
  return {
    id: s.id,
    round_id: round,
    population: s.population,
    client_id: s.client_id,
    round_client_id: s.round_client_id,
    metric_key: s.metric_key,
    metric_version: s.metric_version,
    group: s.group,
    n: s.n ?? 0,
    numerator: s.numerator ?? 0,
    denominator: s.denominator ?? 0,
    missing: s.missing ?? 0,
    suppressed: s.suppressed,
    stale: s.stale,
    status: s.status,
    computed_at: at(s.computed_at)!,
    released_at: at(s.released_at),
    superseded_at: s.superseded_at === null ? null : new Date(s.superseded_at),
    superseded_reason: s.superseded_reason,
    release_id: s.release_id,
  };
}

/** What the rest of the archive declares: its RoundClients and metric definitions. */
export interface ArchiveRefs {
  roundClients: ReadonlyMap<string, string>;
  metrics: readonly { key: string; version: number; part: 'common' | 'leader' }[];
}

/** Beyond the shape (ADR-020/021): no visible cell below k (except the exact counter on
 * round_client × all), leader metrics only in leaders_all, every cell of a declared metric and
 * RoundClient. A failing archive is rejected as a whole. */
export function assertRestorable(
  snapshots: readonly ArchivedSnapshot[],
  config: { k: number; exact_counts: readonly string[] },
  refs: ArchiveRefs,
): void {
  for (const s of snapshots) {
    const where = `${s.population}/${s.metric_key}/${s.group}`;
    const def = refs.metrics.find(
      (d) =>
        d.version === s.metric_version &&
        (s.metric_key === d.key || s.metric_key.startsWith(`${d.key}.`)),
    );
    if (!def) throw new ArchiveRejected(`no metric definition for ${where}`);
    if ((def.part === 'leader') !== (s.population === 'leaders_all'))
      throw new ArchiveRejected(`part ${def.part} does not fit ${where}`);
    if (s.round_client_id !== null && refs.roundClients.get(s.round_client_id) !== s.client_id)
      throw new ArchiveRejected(`unknown round client in ${where}`);
    const exact =
      s.population === 'round_client' &&
      s.group === 'all' &&
      config.exact_counts.includes(s.metric_key);
    if (!s.suppressed && !exact && (s.n ?? 0) < config.k)
      throw new ArchiveRejected(`visible cell below k: ${where}`);
  }
}
