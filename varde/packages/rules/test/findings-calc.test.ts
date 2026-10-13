// 1.10: dashboard calculations, table-driven (docs/sonemodell.md, dashboard.html).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cross,
  distribution,
  heaviestTask,
  type MetricRow,
  personLevel,
  personScore,
  personsPerZone,
  routineHoursWeek,
  scoresOf,
  scoreStat,
  zone,
} from '../src/findings/index.js';

const zoneDefs = JSON.parse(
  readFileSync(new URL('../../schema/fixtures/metrics/zone.v1.json', import.meta.url), 'utf8'),
) as {
  key: string;
  questions: { key: string }[];
  options_mapping: Record<string, Record<string, number>>;
}[];
const MEAN = zoneDefs[0]!;
const SCORING = MEAN.options_mapping;
const QS = MEAN.questions.map((q) => q.key);
const row = (answers: Record<string, unknown>, role = 'kontor', client = 'a'): MetricRow => ({
  client,
  role,
  part: 'common',
  answers,
});

describe('zones (1.10)', () => {
  it.each([
    [0, 0],
    [0.5, 0],
    [0.51, 1],
    [1.5, 1],
    [1.51, 2],
    [2.5, 2],
    [2.51, 3],
  ])('aggregate %s → level %s (value > bound)', (v, l) => expect(zone(v, [0.5, 1.5, 2.5])).toBe(l));

  it.each([
    [0.99, 0],
    [1, 1],
    [1.99, 1],
    [2, 2],
    [3, 3],
  ])('person %s → level %s (value ≥ bound)', (v, l) => expect(personLevel(v, [1, 2, 3])).toBe(l));

  it('F10 sjeldan = 2, oftast = 1', () => {
    expect(scoresOf(row({ F10: 'sjeldan' }), SCORING, QS)).toEqual([2]);
    expect(scoresOf(row({ F10: 'oftast' }), SCORING, QS)).toEqual([1]);
  });

  it('free text, F15 and F20–F22 are not scored', () => {
    expect(QS).not.toContain('F15');
    expect(
      scoresOf(
        row({ F15: ['m365'], F20: 'nei', F21: 'usikker', F22: 'x', F3: 'nei' }),
        SCORING,
        QS,
      ),
    ).toEqual([2]);
  });

  it('stat: mean over answers, critical = score ≥ 2, persons with a score', () => {
    const s = scoreStat(
      [row({ F3: 'ja', F4: 'ja' }), row({ F3: 'nei' }), row({ F15: ['vpn'] })],
      SCORING,
      QS,
    );
    expect(s).toMatchObject({ sum: 5, count: 3, critical: 2, persons: 2 });
    expect(s.mean).toBeCloseTo(5 / 3);
  });

  it('person score and persons per zone', () => {
    expect(personScore(row({ F3: 'ja', F5: 'nei' }), SCORING, QS)).toBe(1);
    expect(personScore(row({}), SCORING, QS)).toBeNull();
    const p = personsPerZone(
      [row({ F3: 'ja' }), row({ F3: 'nei' }), row({ F4: 'ja' }), row({})],
      SCORING,
      QS,
      [1, 2, 3],
    );
    expect(p).toEqual({ n: 3, levels: [1, 0, 1, 1] });
  });
});

describe('distributions and KI blocks (1.10)', () => {
  it('multi: a person counts once per option; n = answered', () => {
    const d = distribution([row({ K3: ['a', 'b'] }), row({ K3: ['a'] }), row({})], 'K3', {
      a: 'a',
      b: 'b',
    });
    expect(d.n).toBe(2);
    expect(Object.fromEntries(d.counts)).toEqual({ a: 2, b: 1 });
  });

  it('scale row as key K12.sporje', () => {
    const d = distribution(
      [row({ K12: { sporje: 2 } }), row({ K12: { vurdere: 1 } })],
      'K12.sporje',
      { '1': '1', '2': '2' },
    );
    expect([d.n, d.counts.get('2')]).toEqual([1, 1]);
  });

  it('K7 × K8: pairs among those who answered both', () => {
    const m = { aldri: 'aldri', veke: 'veke' };
    const c = cross(
      [row({ K7: 'aldri', K8: 'veke' }), row({ K7: 'aldri', K8: 'veke' }), row({ K7: 'aldri' })],
      ['K7', 'K8'],
      m,
      m,
    );
    expect(c.n).toBe(2);
    expect(c.counts.get('aldri.veke')).toBe(2);
  });

  it('routine hours a week via TIMAR', () => {
    const r = routineHoursWeek([row({ K4: 'u1' }), row({ K4: '5-10' }), row({ K4: 'vk' })], 'K4', {
      u1: 0.5,
      '5-10': 7.5,
    });
    expect(r).toEqual({ n: 2, sum: 8 });
  });

  it('heaviest task: times × minutes / 60 per task', () => {
    const h = heaviestTask(
      [
        row({ K16: 'epost', K17: 'dag', K18: '15-30' }),
        row({ K16: 'epost', K17: 'veke' }),
        row({ K16: 'faktura', K17: 'veke', K18: 'u5' }),
      ],
      ['K16', 'K17', 'K18'],
      { dag: 5, veke: 3 },
      { u5: 3, '15-30': 22 },
    );
    expect(h.get('epost')).toEqual({ persons: 2, hours: (5 * 22) / 60, withTime: 1 });
    expect(h.get('faktura')?.hours).toBeCloseTo(0.15);
  });
});
