// 2.5 (unit): the FindingRule schema and its invariants, what a new version may change, and what the
// preview makes of cells under k. No database: rule contexts are given as data.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { TemplateContent } from '@varde/schema/template/template';
import { describe, expect, it } from 'vitest';
import { explainCells, explainClients, explainLeader } from '../../src/modules/findings/explain.js';
import {
  FindingRule,
  IDENTITY_FIELDS,
  RuleDraft,
} from '../../src/modules/findings/finding-rule.js';
import type { RuleContext } from '../../src/modules/findings/rule-choices.js';
import { changedFields, RuleVersions } from '../../src/modules/findings/rule-versions.service.js';
import type { ViewCell } from '../../src/modules/privacy/privacy.service.js';
import { SEED_DIR } from '../support/seed-dir.js';

const seed = (family: string) =>
  FindingRule.array().parse(
    JSON.parse(readFileSync(join(SEED_DIR, 'findings', `${family}.json`), 'utf8')),
  );
const all = [...seed('tryggleik'), ...seed('ki')];
const rule = (key: string) => structuredClone(all.find((r) => r.key === key)!);
const draftOf = (rule: FindingRule): Omit<FindingRule, 'version'> => {
  const rest: Partial<FindingRule> = { ...rule };
  delete rest.version;
  return rest as Omit<FindingRule, 'version'>;
};
const f12Context: RuleContext = {
  choices: ['ja', 'delvis', 'nei', 'usikker'].map((id) => ({ id, label: id })),
  locked: false,
  countsAnswers: true,
  questions: [{ id: 'F12', label: 'Veit kor dei skal melde frå' }],
};
const versions = new RuleVersions(undefined as never);
const rejects = (fn: () => unknown, text: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify((e as BadRequestException).getResponse())).toMatch(text);
    return;
  }
  throw new Error('expected a 400');
};

describe('FindingRule schema (2.5)', () => {
  it('every seed rule satisfies the invariants the editor enforces', () => {
    expect(all).toHaveLength(39);
  });
  it('thresholds: 0 ≤ medium ≤ high ≤ 1', () => {
    const base = draftOf(rule('tryggleik.f12'));
    for (const threshold of [
      { medium: 0, high: 0 },
      { medium: 0.2, high: 0.2 },
      { medium: 0.1, high: 1 },
    ])
      expect(RuleDraft.safeParse({ ...base, threshold }).success).toBe(true);
    for (const threshold of [
      { medium: 0.4, high: 0.3 },
      { medium: 0.2, high: 1.01 },
      { medium: -0.1, high: 0.3 },
    ])
      expect(RuleDraft.safeParse({ ...base, threshold }).success, JSON.stringify(threshold)).toBe(
        false,
      );
  });
  it('texts are non-blank in nn and en; placeholders only where evaluate fills them', () => {
    const base = draftOf(rule('tryggleik.f12'));
    expect(RuleDraft.safeParse({ ...base, text: { nn: '  ', en: 'x' } }).success).toBe(false);
    expect(RuleDraft.safeParse({ ...base, action_text: { nn: 'x', en: '' } }).success).toBe(false);
    expect(RuleDraft.safeParse({ ...base, text: { nn: '{n} har', en: 'x' } }).success).toBe(false);
    const routine = draftOf(rule('ki.routine_hours'));
    expect(RuleDraft.safeParse({ ...routine, text: { nn: 'hos {n}', en: '{n}' } }).success).toBe(
      true,
    );
    expect(RuleDraft.safeParse({ ...routine, text: { nn: '{task}', en: 'x' } }).success).toBe(
      false,
    );
    // The action text is shown as it is: a placeholder there would reach the dashboard raw.
    const action = { nn: 'Start med {n}', en: 'Start with {n}' };
    expect(RuleDraft.safeParse({ ...routine, action_text: action }).success).toBe(false);
  });
  it('a draft has no version and no duplicate options', () => {
    expect(RuleDraft.safeParse(rule('tryggleik.f12')).success).toBe(false);
    const base = draftOf(rule('tryggleik.f12'));
    expect(RuleDraft.safeParse({ ...base, options: ['nei', 'nei'] }).success).toBe(false);
  });
});

describe('a new version keeps what the rule measures (2.5)', () => {
  it('rejects a change of every identity field with 400', () => {
    const current = rule('tryggleik.leader_b18_direct');
    for (const field of IDENTITY_FIELDS) {
      const draft: Record<string, unknown> = draftOf(structuredClone(current));
      draft[field] =
        field === 'channel'
          ? 'aggregate'
          : field === 'computed'
            ? 'routine'
            : field === 'raw_options'
              ? ['svar']
              : `${String(draft[field])}x`;
      rejects(
        () => versions.draft(current, draft, { ...f12Context, locked: true }),
        new RegExp(field),
      );
    }
  });
  it('accepts texts, thresholds, min_count, severity and valid options', () => {
    const current = rule('tryggleik.f12');
    const draft = {
      ...draftOf(current),
      options: ['nei', 'usikker', 'delvis'],
      threshold: { medium: 0.2, high: 0.4 },
      min_count: 3,
      severity: 'opportunity' as const,
      text: { nn: 'Ny tekst', en: 'New text' },
    };
    expect(versions.draft(current, draft, f12Context).options).toEqual([
      'nei',
      'usikker',
      'delvis',
    ]);
    expect(changedFields(current, { ...draft, version: 2 })).toEqual([
      'min_count',
      'options',
      'severity',
      'text',
      'threshold',
    ]);
  });
  it('options exist in the metric, at least one; leader and computed options are fixed', () => {
    const current = rule('tryggleik.f12');
    rejects(
      () => versions.draft(current, { ...draftOf(current), options: ['kanskje'] }, f12Context),
      /finst/,
    );
    rejects(
      () => versions.draft(current, { ...draftOf(current), options: [] }, f12Context),
      /minst eitt/,
    );
    const leader = rule('tryggleik.leader_b13');
    const locked = { ...f12Context, locked: true };
    rejects(
      () => versions.draft(leader, { ...draftOf(leader), options: ['nei'] }, locked),
      /ligg fast/,
    );
    expect(versions.draft(leader, { ...draftOf(leader), level: 'high' }, locked).level).toBe(
      'high',
    );
    const routine = rule('ki.routine_hours');
    const hours = { ...f12Context, countsAnswers: false, choices: [] };
    rejects(() => versions.draft(routine, { ...draftOf(routine), options: ['x'] }, hours), /timar/);
  });
  it('the preview takes only fields that decide the outcome from a draft', () => {
    const current = rule('tryggleik.f12');
    const preview = versions.previewDraft(
      current,
      {
        ...draftOf(current),
        text: { nn: '', en: '' },
        key: 'x.y',
        threshold: { medium: 0.5, high: 0.6 },
      },
      f12Context,
    );
    expect(preview).toEqual({ ...current, threshold: { medium: 0.5, high: 0.6 } });
    rejects(
      () => versions.previewDraft(current, { threshold: { medium: 0.7, high: 0.6 } }, f12Context),
      /Tersklane/,
    );
  });
});

const content = { key: 'tryggleik', questions: [] } as unknown as TemplateContent;
/** F12 cells as the privacy module gives them: n < 3 means suppressed, without numbers. */
const f12Cells = (n: number, nei: number): ViewCell[] =>
  ['ja', 'delvis', 'nei', 'usikker'].map((o): ViewCell => {
    const base = { metric_key: `tryggleik.f12.distribution.${o}`, metric_version: 1, group: 'all' };
    if (n < 3) return { ...base, suppressed: true };
    const numerator = o === 'nei' ? nei : o === 'ja' ? n - nei : 0;
    return { ...base, suppressed: false, n, numerator, denominator: n, missing: 0 };
  });
describe('preview outcomes under k (2.5)', () => {
  it('visible cells give numbers and the level of each version', () => {
    const current = rule('tryggleik.f12');
    expect(explainCells(current, f12Cells(12, 4), content, 'all')).toEqual({
      kind: 'finding',
      level: 'high',
      tal: '4 av 12',
      share: 4 / 12,
    });
    const strict = { ...current, threshold: { medium: 0.5, high: 0.8 } };
    expect(explainCells(strict, f12Cells(12, 4), content, 'all')).toEqual({
      kind: 'none',
      tal: '4 av 12',
      share: 4 / 12,
    });
  });
  it('suppressed cells (n < 3) give no outcome and no numbers; absent cells are empty', () => {
    const hidden = explainCells(rule('tryggleik.f12'), f12Cells(2, 2), content, 'all');
    expect(hidden).toEqual({ kind: 'hidden' });
    expect(explainCells(rule('tryggleik.f12'), [], content, 'all')).toEqual({ kind: 'empty' });
  });
  it('leader rows of one client and F12 × B13 use the same logic as the dashboard', () => {
    const b13 = rule('tryggleik.leader_b13');
    expect(explainLeader(b13, [{ answers: { B13: 'nei' } }], undefined)).toMatchObject({
      kind: 'finding',
      tal: '1 av 1 leiar',
    });
    expect(explainLeader(b13, [{ answers: { B13: 'skrive' } }], undefined)).toMatchObject({
      kind: 'none',
    });
    const cross = rule('tryggleik.f12_x_b13');
    const ja = f12Cells(4, 0).find((c) => c.metric_key.endsWith('.ja'));
    expect(explainLeader(cross, [{ answers: { B13: 'nei' } }], ja)).toMatchObject({
      kind: 'finding',
      tal: '4 av 4',
    });
    const few = f12Cells(2, 0).find((c) => c.metric_key.endsWith('.ja'));
    expect(explainLeader(cross, [{ answers: { B13: 'nei' } }], few)).toEqual({ kind: 'hidden' });
    expect(explainClients(0)).toMatchObject({ kind: 'none', tal: '0 kundar' });
    expect(explainClients(1)).toMatchObject({ kind: 'finding', tal: '1 kunde' });
  });
});
