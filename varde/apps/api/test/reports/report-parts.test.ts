// Pure parts of the client report (5.1): languages, hidden cells, dashboard order of findings,
// texts of computed findings and comparability between two rounds.
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { TemplateContent } from '@varde/schema/template/template';
import { describe, expect, it } from 'vitest';
import type { FindingRule } from '../../src/modules/findings/finding-rule.js';
import type { ViewCell } from '../../src/modules/privacy/privacy.service.js';
import {
  byDashboardOrder,
  defaultLanguage,
  degreeOf,
  findingText,
  osloDay,
  reportLanguages,
  respondents,
  scoreDefs,
  scoreStats,
  weakest,
} from '../../src/modules/reports/report-parts.js';

const shown = (
  metric_key: string,
  n: number,
  numerator: number,
  denominator: number,
  missing = 0,
): ViewCell => ({
  metric_key,
  metric_version: 1,
  group: 'all',
  suppressed: false,
  n,
  numerator,
  denominator,
  missing,
});
const hidden = (metric_key: string): ViewCell => ({
  metric_key,
  metric_version: 1,
  group: 'all',
  suppressed: true,
});
const def = (key: string, kind: MetricDefinition['kind'], extra: Partial<MetricDefinition> = {}) =>
  ({
    key,
    version: 1,
    kind,
    part: 'common',
    questions: [{ key: 'F2', part: 'common' }],
    options_mapping: { F2: { kontor: 'kontor', sal: 'sal' } },
    scale: 'x',
    recall_period: 'x',
    denominator_rule: 'x',
    populations: ['round_client'],
    comparability: [],
    first_version: true,
    ...extra,
  }) as MetricDefinition;
const content = {
  key: 't',
  questions: [
    {
      id: 'F2',
      part: 'common',
      role: true,
      type: 'single',
      options: [],
      texts: { text: { nn: 'Rolle' } },
    },
  ],
} as unknown as TemplateContent;
const rule = (extra: Partial<FindingRule>): FindingRule => ({
  key: 'r',
  version: 1,
  channel: 'aggregate',
  metric_key: 'ki.heaviest_task',
  options: [],
  basis: 'b',
  threshold: { medium: 0.15, high: 0.3 },
  min_count: 2,
  text: { nn: 'veit ikkje', en: 'do not know' },
  action_text: { nn: 'Gjer noko', en: 'Do something' },
  severity: 'risk',
  order: 0,
  ...extra,
});

describe('report languages (ADR-019)', () => {
  it('nn and en always, nb only with the switch; the client language if available', () => {
    expect(reportLanguages(['nn', 'en'])).toEqual(['nn', 'en']);
    expect(reportLanguages(['nn', 'en', 'nb'])).toEqual(['nn', 'en', 'nb']);
    expect(defaultLanguage(['nn', 'en'], 'nb')).toBe('nn');
    expect(defaultLanguage(['nn', 'en'], 'en')).toBe('en');
    expect(osloDay(new Date('2026-10-15T22:43:00Z'))).toBe('2026-10-16');
  });
});

describe('numbers come only from visible cells', () => {
  const defs = [
    def('t.f2', 'distribution'),
    def('t.mean_score', 'mean_score'),
    def('t.zone', 'zone'),
  ];
  it('respondents: role question first (n + missing), then the score; hidden → null', () => {
    expect(
      respondents(
        [shown('t.f2.kontor', 7, 3, 7, 2), shown('t.mean_score.all', 8, 9, 30, 1)],
        defs,
        content,
      ),
    ).toBe(9);
    expect(
      respondents([hidden('t.f2.kontor'), shown('t.mean_score.all', 8, 9, 30, 1)], defs, content),
    ).toBe(9);
    expect(
      respondents([hidden('t.f2.kontor'), hidden('t.mean_score.all')], defs, content),
    ).toBeNull();
  });
  it('zone stats of a hidden cell are null, never zero', () => {
    const s = scoreDefs(defs);
    expect(
      scoreStats([shown('t.mean_score.F3', 4, 6, 4), shown('t.zone.F3', 4, 2, 1)], s, 'F3'),
    ).toEqual({
      mean: 1.5,
      critical: null,
      zone: 2,
    });
    expect(scoreStats([hidden('t.mean_score.F3'), hidden('t.zone.F3')], s, 'F3')).toEqual({
      mean: null,
      critical: null,
      zone: null,
    });
  });
});

describe('findings', () => {
  it('dashboard order: high first, larger share, then rule order', () => {
    const f = (level: 'high' | 'medium', share: number, order: number) => ({
      numbers: { n: 10, count: 3, share, level },
      rule: rule({ order }),
    });
    const sorted = [
      f('medium', 0.9, 0),
      f('high', 0.3, 2),
      f('high', 0.5, 3),
      f('high', 0.3, 1),
    ].sort(byDashboardOrder);
    expect(sorted.map((x) => [x.numbers.level, x.numbers.share, x.rule.order])).toEqual([
      ['high', 0.5, 3],
      ['high', 0.3, 1],
      ['high', 0.3, 2],
      ['medium', 0.9, 0],
    ]);
  });
  it('simple and computed texts in nn and en; bokmål falls back to the nn rule text', () => {
    const numbers = { n: 9, count: 4, share: 0.44, level: 'high' as const };
    expect(findingText(rule({}), numbers, 'en', [], content)).toEqual({
      tal: '4 of 9',
      text: 'do not know',
      action: 'Do something',
    });
    expect(findingText(rule({}), numbers, 'nb', [], content).text).toBe('veit ikkje');
    const k16 = {
      key: 'ki',
      questions: [
        {
          id: 'K16',
          part: 'common',
          type: 'single',
          texts: { text: { nn: 'Oppgåve' } },
          options: [
            { id: 'epost', texts: { text: { nn: 'E-post', en: 'Email' } } },
            { id: 'faktura', texts: { text: { nn: 'Faktura', en: 'Invoices' } } },
          ],
        },
      ],
    } as unknown as TemplateContent;
    const heavy = rule({
      computed: 'heaviest',
      text: { nn: '«{task}» for {n} {persons}', en: '“{task}” for {n} {persons}' },
    });
    const cells = [
      shown('ki.heaviest_task.epost', 2, 3, 2),
      shown('ki.heaviest_task.faktura', 3, 6.5, 3),
    ];
    expect(findingText(heavy, { ...numbers, n: 3, count: 6.5 }, 'nn', cells, k16)).toMatchObject({
      tal: '≈ 7 timar/veke',
      text: '«faktura» for 3 personar',
    });
    expect(findingText(heavy, { ...numbers, n: 1, count: 2 }, 'en', cells, k16).text).toBe(
      '“invoices” for 1 person',
    );
    const routine = rule({
      computed: 'routine',
      text: { nn: 'hos dei {n} som svarte', en: 'by the {n} respondents' },
    });
    expect(findingText(routine, { ...numbers, count: 12.4 }, 'en', [], content)).toMatchObject({
      tal: '≈ 12 hours/week',
      text: 'by the 9 respondents',
    });
  });
});

describe('comparability (ADR-020)', () => {
  const a = def('t.mean_score', 'mean_score');
  it('same version comparable; declared links either way; nothing declared incomparable', () => {
    expect(degreeOf(a, a)).toBe('comparable');
    const v2 = def('t.mean_score', 'mean_score', {
      version: 2,
      first_version: undefined,
      comparability: [{ to: 't.mean_score@1', degree: 'approximate', note: 'x' }],
    });
    expect(degreeOf(v2, a)).toBe('approximate');
    expect(degreeOf(a, v2)).toBe('approximate');
    expect(degreeOf(def('u.mean_score', 'mean_score'), a)).toBe('incomparable');
    expect(degreeOf(undefined, a)).toBe('incomparable');
    expect(weakest(['comparable', 'approximate', 'comparable'])).toBe('approximate');
    expect(weakest(['comparable', 'incomparable'])).toBe('incomparable');
  });
});
