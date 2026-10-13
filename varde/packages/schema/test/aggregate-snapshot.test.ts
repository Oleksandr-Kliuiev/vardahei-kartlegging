// Task 0.16: AggregateSnapshot state machine — released is immutable, superseded needs a
// reason, the schema package exposes no way to mark a snapshot released.
import { describe, expect, it } from 'vitest';
import * as snapshotModule from '../src/metrics/aggregate-snapshot.js';
import {
  AggregateSnapshotSchema,
  assertUnchanged,
  type ComputedSnapshot,
  type ReleasedSnapshot,
  SnapshotTransitionError,
  transition,
} from '../src/metrics/aggregate-snapshot.js';
import * as populationsModule from '../src/metrics/populations.js';
import * as definitionModule from '../src/metrics/metric-definition.js';

const computed: ComputedSnapshot = {
  round: 'r1',
  population: 'round_client',
  client: 'c1',
  metric_key: 'tryggleik.mean_score',
  metric_version: 1,
  group: 'all',
  n: 5,
  numerator: 4,
  denominator: 5,
  missing: 0,
  suppressed: false,
  computed_at: '2026-10-13',
  status: 'computed',
};
// Built by hand here: in production only privacy.release() produces this object (0.15b).
// The schema's own tests may assert the brand (lint allows packages/schema/test, 1.10b).
const released = Object.freeze({
  ...computed,
  status: 'released',
  released_at: '2026-10-13',
}) as ReleasedSnapshot;

describe('AggregateSnapshot (0.16)', () => {
  it('the snapshot schema accepts all three statuses and rejects extra keys', () => {
    expect(AggregateSnapshotSchema.safeParse(computed).success).toBe(true);
    expect(AggregateSnapshotSchema.safeParse(released).success).toBe(true);
    expect(AggregateSnapshotSchema.safeParse({ ...computed, answers: {} }).success).toBe(false);
  });

  it('released → computed is rejected', () => {
    expect(() => transition(released, 'computed')).toThrow(SnapshotTransitionError);
  });

  it('computed → released is rejected (only privacy.release() does that)', () => {
    expect(() => transition(computed, 'released')).toThrow(SnapshotTransitionError);
  });

  it('assertUnchanged catches a changed numerator', () => {
    expect(() => assertUnchanged(released, { ...released })).not.toThrow();
    expect(() => assertUnchanged(released, { ...released, numerator: 5 })).toThrow(
      SnapshotTransitionError,
    );
  });

  it('a released snapshot object is frozen', () => {
    expect(() => {
      (released as { numerator: number }).numerator = 9;
    }).toThrow(TypeError);
  });

  it('released → superseded without a reason → rejected', () => {
    expect(() => transition(released, 'superseded')).toThrow(/reason/);
    expect(() => transition(released, 'superseded', { reason: '  ' })).toThrow(/reason/);
  });

  it('released → superseded with a reason → ok, values kept', () => {
    const s = transition(released, 'superseded', { reason: 'new release' });
    expect(s).toMatchObject({ status: 'superseded', superseded_reason: 'new release', n: 5 });
    expect(released.status).toBe('released');
    expect(() => transition(s, 'superseded', { reason: 'again' })).toThrow();
  });

  it('no export of the metrics modules marks a snapshot released', () => {
    const exported = { ...snapshotModule, ...populationsModule, ...definitionModule };
    const functions = Object.entries(exported)
      .filter(([, v]) => typeof v === 'function' && !('safeParse' in (v as object)))
      .map(([k]) => k);
    expect(functions.filter((name) => /releas/i.test(name))).toEqual([]);
    expect(Object.keys(snapshotModule).sort()).toEqual([
      'AggregateSnapshotSchema',
      'ComputedSnapshotSchema',
      'ReleasedSnapshotSchema',
      'SNAPSHOT_STATUSES',
      'SnapshotTransitionError',
      'SupersededSnapshotSchema',
      'assertUnchanged',
      'transition',
    ]);
  });
});
