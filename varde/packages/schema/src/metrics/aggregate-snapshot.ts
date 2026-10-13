// AggregateSnapshot (0.16, ADR-020): computed → released → superseded. This module exports the
// types, `transition` (only released → superseded, with a reason) and `assertUnchanged`.
// computed → released is deliberately NOT exported: only `privacy.release()` (0.15b) performs
// it, through a module-private function, so the marker cannot be forged by an import.
import { z } from 'zod';
import { Population } from './populations.js';

export const SNAPSHOT_STATUSES = ['computed', 'released', 'superseded'] as const;
export type SnapshotStatus = (typeof SNAPSHOT_STATUSES)[number];

const Base = {
  round: z.string().min(1),
  population: Population,
  client: z.string().min(1).optional(),
  metric_key: z.string().min(1),
  metric_version: z.number().int().positive(),
  group: z.string().min(1),
  n: z.number().int().nonnegative(),
  numerator: z.number().nonnegative(),
  denominator: z.number().nonnegative(),
  missing: z.number().int().nonnegative(),
  suppressed: z.boolean(),
  stale: z.boolean().optional(),
  computed_at: z.string().min(1),
};

export const ComputedSnapshotSchema = z.strictObject({
  ...Base,
  status: z.literal('computed'),
});
export const ReleasedSnapshotSchema = z.strictObject({
  ...Base,
  status: z.literal('released'),
  released_at: z.string().min(1),
});
export const SupersededSnapshotSchema = z.strictObject({
  ...Base,
  status: z.literal('superseded'),
  released_at: z.string().min(1),
  superseded_reason: z.string().min(1),
});
export const AggregateSnapshotSchema = z.discriminatedUnion('status', [
  ComputedSnapshotSchema,
  ReleasedSnapshotSchema,
  SupersededSnapshotSchema,
]);

export type ComputedSnapshot = z.infer<typeof ComputedSnapshotSchema>;
export type ReleasedSnapshot = Readonly<z.infer<typeof ReleasedSnapshotSchema>>;
export type SupersededSnapshot = Readonly<z.infer<typeof SupersededSnapshotSchema>>;
export type AggregateSnapshot = ComputedSnapshot | ReleasedSnapshot | SupersededSnapshot;

export class SnapshotTransitionError extends Error {
  override readonly name = 'SnapshotTransitionError';
}

/**
 * The only public transition: released → superseded with a non-empty reason. Every other
 * transition (including computed → released, which belongs to privacy.release()) throws.
 */
export function transition(
  snapshot: AggregateSnapshot,
  to: SnapshotStatus,
  opts: { reason?: string } = {},
): SupersededSnapshot {
  if (snapshot.status !== 'released' || to !== 'superseded') {
    throw new SnapshotTransitionError(`transition ${snapshot.status} → ${to} is not allowed`);
  }
  const reason = opts.reason?.trim() ?? '';
  if (reason === '') throw new SnapshotTransitionError('released → superseded needs a reason');
  return Object.freeze({ ...snapshot, status: 'superseded', superseded_reason: reason });
}

const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );

/** Throws if `next` differs from the released snapshot in any field (tests, trigger in 1.4c). */
export function assertUnchanged(released: ReleasedSnapshot, next: unknown): void {
  if (canonical(released) !== canonical(next)) {
    throw new SnapshotTransitionError('a released snapshot cannot be changed');
  }
}
