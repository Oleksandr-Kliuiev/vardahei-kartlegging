// Task 0.16: MetricDefinition schema and the four fixtures (ADR-020, ADR-026).
import { describe, expect, it } from 'vitest';
import { findBokmal } from '../src/i18n/nn-stoplist.js';
import {
  ComparabilityNote,
  MetricDefinition,
  MetricDefinitionSet,
} from '../src/metrics/metric-definition.js';
import { metricFixtures, readFixture } from './support/fixtures.js';

const NOTE_FILE = 'comparability-f-anchors.v1.json';

type Def = Record<string, unknown>;
const zone = () => (readFixture('zone.v1.json') as Def[]).map((d) => structuredClone(d));
const byKind = (kind: string): Def => {
  const def = zone().find((d) => d.kind === kind);
  if (def === undefined) throw new Error(`no ${kind} in zone.v1.json`);
  return def;
};
const cross = (): Def => structuredClone((readFixture('k7xk8.v1.json') as Def[])[0] ?? {});
const leader = (): Def =>
  structuredClone((readFixture('leaders-distribution.v1.json') as Def[])[0] ?? {});

const rejected = (def: Def): string => {
  const r = MetricDefinition.safeParse(def);
  expect(r.success).toBe(false);
  return r.error?.issues.map((i) => i.message).join('; ') ?? '';
};

describe('metric fixtures (0.16)', () => {
  it('there are four fixture files', () => {
    expect(metricFixtures()).toEqual([
      NOTE_FILE,
      'k7xk8.v1.json',
      'leaders-distribution.v1.json',
      'zone.v1.json',
    ]);
  });

  it.each(['zone.v1.json', 'k7xk8.v1.json', 'leaders-distribution.v1.json'])(
    '%s is a valid set of definitions',
    (file) => {
      const r = MetricDefinitionSet.safeParse(readFixture(file));
      expect(r.error?.issues ?? []).toEqual([]);
    },
  );

  it('zone.v1.json has mean_score, critical_share, zone and persons_per_zone', () => {
    expect(zone().map((d) => d.kind)).toEqual([
      'mean_score',
      'critical_share',
      'zone',
      'persons_per_zone',
    ]);
  });

  it('the comparability note is valid, referenced by the F metrics and nynorsk', () => {
    const note = ComparabilityNote.parse(readFixture(NOTE_FILE));
    expect(note.option_mapping.Skjelden).toBe('sjeldan');
    expect(note.not_scored).toEqual(['F15', 'F20', 'F21', 'F22']);
    for (const def of zone()) {
      const to = (def.comparability as { to: string }[]).map((c) => c.to);
      expect(to).toContain(`${note.key}@${note.version}`);
    }
    expect(findBokmal(note.note)).toEqual([]);
  });
});

describe('MetricDefinition refinements (0.16)', () => {
  it('missing comparability → rejected', () => {
    const def = byKind('mean_score');
    delete def.comparability;
    rejected(def);
  });

  it('empty comparability without first_version → rejected', () => {
    const def = cross();
    delete def.first_version;
    expect(rejected(def)).toMatch(/first_version/);
  });

  it('zone without thresholds → rejected', () => {
    const def = byKind('zone');
    delete def.thresholds;
    expect(rejected(def)).toMatch(/zone needs thresholds/);
  });

  it('persons_per_zone without thresholds → rejected', () => {
    const def = byKind('persons_per_zone');
    delete def.thresholds;
    expect(rejected(def)).toMatch(/persons_per_zone needs thresholds/);
  });

  it('without part → rejected', () => {
    const def = byKind('mean_score');
    delete def.part;
    rejected(def);
  });

  it('leader metric with round_client → rejected', () => {
    const def = leader();
    def.populations = ['round_client'];
    expect(rejected(def)).toMatch(/round_client does not allow part leader/);
  });

  it('common metric with leaders_all → rejected', () => {
    const def = byKind('mean_score');
    def.populations = ['leaders_all'];
    expect(rejected(def)).toMatch(/leaders_all does not allow part common/);
  });

  it('cross with questions from different parts → rejected', () => {
    const def = cross();
    def.questions = [
      { key: 'F12', part: 'common' },
      { key: 'B13', part: 'leader' },
    ];
    expect(rejected(def)).toMatch(/B13 is part leader, metric is common/);
  });

  it('cross with three questions → rejected', () => {
    const def = cross();
    def.questions = ['K7', 'K8', 'K9'].map((key) => ({ key, part: 'common' }));
    expect(rejected(def)).toMatch(/exactly two questions/);
  });

  it('questions[].part ≠ part → rejected (metric mixing parts)', () => {
    const def = byKind('mean_score');
    (def.questions as { part: string }[])[0]!.part = 'leader';
    expect(rejected(def)).toMatch(/is part leader, metric is common/);
  });

  it('thresholds not increasing or with the wrong comparison → rejected', () => {
    const def = byKind('zone');
    const t = def.thresholds as { person: { bounds: number[]; compare: string } };
    t.person.bounds = [2, 1, 3];
    rejected(def);
    const def2 = byKind('zone');
    (def2.thresholds as { person: { compare: string } }).person.compare = '>';
    rejected(def2);
  });

  it('unknown field → rejected (strict)', () => {
    rejected({ ...byKind('mean_score'), respondent_key: 'x' });
  });
});
