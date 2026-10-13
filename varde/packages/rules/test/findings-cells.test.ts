// 1.10: cells of a definition — groups by population, parts, sub-metrics.
import { readFileSync } from 'node:fs';
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import { describe, expect, it } from 'vitest';
import { cells, type MetricRow, subMetrics } from '../src/findings/index.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../schema/fixtures/metrics/${name}`, import.meta.url), 'utf8'),
  ) as MetricDefinition[];
const [MEAN, , ZONE, PPZ] = fixture('zone.v1.json');
const LEADERS = fixture('leaders-distribution.v1.json')[0]!;
const r = (
  client: string,
  role: string,
  answers: Record<string, unknown>,
  part: 'common' | 'leader' = 'common',
): MetricRow => ({ client, role, part, answers });
const ROWS = [
  r('a', 'sal', { F3: 'ja' }),
  r('a', 'sal', { F3: 'nei' }),
  r('b', 'kontor', { F3: 'nei' }),
  r('a', 'leiar', { B13: 'nei' }, 'leader'),
];

describe('cells (1.10)', () => {
  it('all_clients: groups all, role:<id>, client:<slug>', () => {
    const groups = new Set(cells(MEAN!, ROWS, 'all_clients').map((c) => c.group));
    expect([...groups]).toEqual(['all', 'role:kontor', 'role:sal', 'client:a', 'client:b']);
  });

  it('round_client: groups all and role:<id>, client set on every cell, no person:* groups', () => {
    const cs = cells(
      MEAN!,
      ROWS.filter((x) => x.client === 'a'),
      'round_client',
      'a',
    );
    expect(new Set(cs.map((c) => c.group))).toEqual(new Set(['all', 'role:sal']));
    expect(cs.every((c) => c.client === 'a' && !c.group.startsWith('person:'))).toBe(true);
  });

  it('a leader metric: only leaders_all, only group all, only leader rows', () => {
    expect(cells(LEADERS, ROWS, 'round_client', 'a')).toEqual([]);
    const cs = cells(LEADERS, ROWS, 'leaders_all');
    expect(new Set(cs.map((c) => c.group))).toEqual(new Set(['all']));
    expect(cs.find((c) => c.metric_key.endsWith('.nei'))).toMatchObject({ n: 1, numerator: 1 });
  });

  it('mean score: sub-metric all and per question; numerator = sum, denominator = answers', () => {
    const cs = cells(MEAN!, ROWS, 'all_clients').filter((c) => c.group === 'all');
    expect(cs.find((c) => c.metric_key === `${MEAN!.key}.all`)).toMatchObject({
      n: 3,
      numerator: 4,
      denominator: 3,
    });
    expect(cs.find((c) => c.metric_key === `${MEAN!.key}.F3`)).toMatchObject({
      n: 3,
      numerator: 4,
    });
  });

  it('zone and persons per zone', () => {
    const z = cells(ZONE!, ROWS, 'all_clients').find(
      (c) => c.group === 'all' && c.metric_key === `${ZONE!.key}.all`,
    );
    expect(z?.numerator).toBe(1); // mean 4/3 → gul
    const p = cells(PPZ!, ROWS, 'all_clients').filter((c) => c.group === 'all');
    expect(p.map((c) => [c.metric_key.split('.').at(-1), c.numerator])).toEqual([
      ['gron', 1],
      ['gul', 0],
      ['oransje', 2],
      ['raud', 0],
    ]);
  });

  it('sub-metrics do not depend on the rows', () => {
    expect(subMetrics(PPZ!)).toHaveLength(4);
    expect(subMetrics(MEAN!)).toHaveLength(17);
  });
});
