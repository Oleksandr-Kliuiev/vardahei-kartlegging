// Task 0.14: aggregation rules and thresholds of score.ts on fixture sheets (0d.md: pass, fail by
// median, fail by a critical error) plus the full ADR-010 profile the harness grows into.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRatings, type Rating } from '../src/csv.js';
import { aggregate, median, type RunRef, ScoreInputError, THRESHOLDS } from '../src/score.js';
import { runs5 } from './support.js';

const sheet = (name: string, rater = 'oleksandr'): Rating[] =>
  parseRatings(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
    `${rater}.csv`,
  );
const simplified = (ratings: Rating[], runs = runs5()) =>
  aggregate(runs, ratings, THRESHOLDS.simplified);

describe('score, simplified profile (decision 13.10: 5 briefs × 1 model × 1 run, one rater)', () => {
  it('pass: medians exactly 4, 4 of 5 briefs without critical errors; slow briefs only reported', () => {
    const [r] = simplified(sheet('pass.csv'));
    expect(r).toMatchObject({
      model: 'claude-opus-5-5',
      ratings: 5,
      median_meaning: 4,
      median_naturalness: 4,
      sum_of_medians: 8,
      critical_free_briefs: 4,
      slow_briefs: ['brief-c', 'brief-d'],
      pass: true,
      reasons: [],
    });
    expect(r!.briefs.find((b) => b.brief === 'brief-e')!.critical).toEqual(['invented_fact']);
    expect(r!.cost_per_brief_usd).toBe(0.07);
  });

  it('fail by median: naturalness median 3', () => {
    const [r] = simplified(sheet('fail-median.csv'));
    expect(r!.pass).toBe(false);
    expect(r!.reasons).toEqual(['медиана естественности 3 < 4']);
  });

  it('fail by critical errors: only 3 of 5 briefs are free of them', () => {
    const [r] = simplified(sheet('fail-critical.csv'));
    expect(r!.pass).toBe(false);
    expect(r!.critical_free_briefs).toBe(3);
    expect(r!.reasons).toEqual(['брифов без критических ошибок 3 из 5 < 4']);
    expect(r!.briefs.find((b) => b.brief === 'brief-e')!.critical).toEqual([
      'invented_fact',
      'product_name',
    ]);
  });

  it('automatic critical codes count even when the rater did not mark them (refusal)', () => {
    expect(simplified(sheet('pass.csv'), runs5({ 'brief-e': ['refusal'] }))[0]!.pass).toBe(true);
    const [r] = simplified(sheet('pass.csv'), runs5({ 'brief-a': ['refusal'] }));
    expect(r!.pass).toBe(false);
    expect(r!.briefs[0]!.critical).toEqual(['refusal']);
  });

  it('rejects sheets that do not match the recorded runs', () => {
    const ratings = sheet('pass.csv');
    const problems = (rs: Rating[], runs: RunRef[] = runs5()): string[] => {
      try {
        simplified(rs, runs);
      } catch (e) {
        if (e instanceof ScoreInputError) return e.problems;
        throw e;
      }
      return [];
    };
    expect(problems(ratings.slice(0, 4))).toEqual([
      'oleksandr: no rating for brief-e / claude-opus-5-5#1',
    ]);
    expect(problems([...ratings, ratings[0]!])).toEqual([
      'oleksandr.csv:2: oleksandr rated brief-a / claude-opus-5-5#1 twice',
    ]);
    const stale = ratings.map((r, i) => (i === 1 ? { ...r, output_sha: '0000000000ff' } : r));
    expect(problems(stale)).toEqual([
      'oleksandr.csv:3: output_sha 0000000000ff is not the recorded answer 0000000000a2',
    ]);
    expect(problems(ratings.slice(0, 4), runs5().slice(0, 4))).toEqual([
      'profile expects 5 briefs, the recorded runs cover 4',
    ]);
    expect(
      problems([{ ...ratings[0]!, variant: 'claude-sonnet-5-5#1' }, ...ratings.slice(1)]),
    ).toContain('oleksandr.csv:2: no recorded run for brief-a / claude-sonnet-5-5#1');
  });
});

describe('scoring sheets', () => {
  it('accept semicolons, BOM, CRLF, decimal comma and quoted code lists', () => {
    const [a, b] = sheet('semicolon.csv', 'asbjorn');
    expect(a).toMatchObject({
      rater: 'asbjorn',
      brief: 'brief-a',
      meaning: 4,
      naturalness: 5,
      edit_minutes: 2.5,
      critical: ['mixed_nn_nb', 'product_name'],
      output_sha: null,
    });
    expect(b).toMatchObject({ edit_minutes: 0, critical: [] });
  });

  it('reject unknown codes, scores outside 1–5 and missing columns', () => {
    const head = 'brief,variant,meaning_1_5,naturalness_1_5,edit_minutes,critical_errors\n';
    expect(() => parseRatings(`${head}b,v,4,4,1,typo\n`, 'o.csv')).toThrow(
      /unknown critical_errors typo/,
    );
    expect(() => parseRatings(`${head}b,v,6,4,1,\n`, 'o.csv')).toThrow(/meaning_1_5 must be 1–5/);
    expect(() => parseRatings('brief,variant\nb,v\n', 'o.csv')).toThrow(/missing columns/);
  });
});

describe('score, full profile (ADR-010: 10 briefs × 2 models × 2 runs, two blind raters)', () => {
  const models = ['claude-opus-5-5', 'claude-sonnet-5-5'];
  const briefs = Array.from({ length: 10 }, (_, i) => `b${String(i + 1).padStart(2, '0')}`);
  const runs: RunRef[] = models.flatMap((model) =>
    briefs.flatMap((brief) =>
      [1, 2].map((run) => ({
        model,
        brief,
        run,
        output_sha: `${brief}${model[7]}${run}`.padEnd(12, '0'),
        auto_critical: [],
        cost_usd: model.includes('opus') ? 0.08 : 0.04,
      })),
    ),
  );
  // Blind key: per brief, letters A–D in a shuffled order (here reversed for odd briefs).
  const key = Object.fromEntries(
    briefs.map((brief, i) => {
      const labels = models.flatMap((m) => [`${m}#1`, `${m}#2`]);
      const order = i % 2 === 1 ? [...labels].reverse() : labels;
      return [brief, Object.fromEntries(order.map((label, j) => ['ABCD'[j]!, label]))];
    }),
  );
  /** Ratings of both raters; `tweak` adjusts one rating. */
  function ratings(tweak: (r: Rating, model: string) => Rating = (r) => r): Rating[] {
    return ['asbjorn', 'bjarte'].flatMap((rater) =>
      briefs.flatMap((brief) =>
        Object.entries(key[brief]!).map(([letter, label]) => {
          const base: Rating = {
            rater,
            brief,
            variant: letter,
            meaning: 4,
            naturalness: 4,
            edit_minutes: 3,
            critical: [],
            output_sha: null,
            at: `${rater}.csv`,
          };
          return tweak(base, label.split('#')[0]!);
        }),
      ),
    );
  }

  it('both models pass: the report gets both sums of medians and cost per brief', () => {
    const result = aggregate(runs, ratings(), THRESHOLDS.full, key);
    expect(
      result.map((r) => [r.model, r.pass, r.ratings, r.sum_of_medians, r.cost_per_brief_usd]),
    ).toEqual([
      ['claude-opus-5-5', true, 40, 8, 0.16],
      ['claude-sonnet-5-5', true, 40, 8, 0.08],
    ]);
  });

  it('fails when more than 2 briefs have a median edit time over 5 minutes', () => {
    const slow = new Set(['b01', 'b02', 'b03']);
    const result = aggregate(
      runs,
      ratings((r, m) =>
        m === 'claude-sonnet-5-5' && slow.has(r.brief) ? { ...r, edit_minutes: 7 } : r,
      ),
      THRESHOLDS.full,
      key,
    );
    expect(result[0]!.pass).toBe(true);
    expect(result[1]!.reasons).toEqual(['брифов с правкой > 5 мин: 3 > 2']);
  });

  it('a critical error marked by one rater in one run counts for the brief', () => {
    const critical = new Set(['b01', 'b02', 'b03']);
    const result = aggregate(
      runs,
      ratings((r, m) =>
        m === 'claude-opus-5-5' &&
        critical.has(r.brief) &&
        r.rater === 'bjarte' &&
        key[r.brief]![r.variant] === `${m}#2`
          ? { ...r, critical: ['wrong_language'] }
          : r,
      ),
      THRESHOLDS.full,
      key,
    );
    expect(result[0]!.critical_free_briefs).toBe(7);
    expect(result[0]!.reasons).toEqual(['брифов без критических ошибок 7 из 10 < 8']);
  });

  it('needs two raters', () => {
    const one = ratings().filter((r) => r.rater === 'asbjorn');
    expect(() => aggregate(runs, one, THRESHOLDS.full, key)).toThrow(/expects 2 rater/);
  });
});

describe('median', () => {
  it('odd and even counts', () => {
    expect(median([5, 1, 4])).toBe(4);
    expect(median([4, 3, 5, 4])).toBe(4);
    expect(median([3, 4])).toBe(3.5);
  });
});
