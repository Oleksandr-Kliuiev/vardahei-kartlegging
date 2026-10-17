// When the template's definitions hold for a version made in the workshop (2.16, after review): a
// frozen question by its anchor and structure, any other question exactly; what it depends on must
// hold too, and a leader question needs the same leader roles. Unit test on the seeded surveys.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type MetricDefinition,
  MetricDefinitionSet,
} from '@varde/schema/metrics/metric-definition';
import type { TemplateContent } from '@varde/schema/template/template';
import { referenceOf, sameMeaning } from '../../src/modules/metrics/same-meaning.js';
import { SEED_DIR, seedContent } from '../support/seed-dir.js';

type Q = TemplateContent['questions'][number];
const defsOf = (family: string): MetricDefinition[] =>
  MetricDefinitionSet.parse(
    Object.entries(
      JSON.parse(readFileSync(join(SEED_DIR, 'metrics', `${family}.json`), 'utf8')) as Record<
        string,
        object
      >,
    ).map(([key, rest]) => ({ key, ...rest })),
  );
const ki = () => seedContent('ki.2026-10-13') as unknown as TemplateContent;
const tryggleik = () => seedContent('tryggleik.2026-10-13') as unknown as TemplateContent;
function held(content: TemplateContent, base: TemplateContent, family: string) {
  const holds = sameMeaning(content, [referenceOf(base)]);
  return new Map(defsOf(family).map((d) => [d.key, holds(d)]));
}
const edit = (c: TemplateContent, id: string, change: (q: Q & Record<string, unknown>) => void) => {
  change(c.questions.find((q) => q.id === id)!);
  return c;
};

describe('the template definitions in a workshop version', () => {
  it('an unchanged survey keeps every definition; a moved section title changes nothing', () => {
    expect([...held(ki(), ki(), 'ki').values()].every(Boolean)).toBe(true);
    const c = tryggleik();
    const f8 = c.questions.find((q) => q.id === 'F8')!;
    const title = f8.texts.section_title;
    delete f8.texts.section_title;
    c.questions.find((q) => q.id === 'F9')!.texts.section_title = title!;
    expect([...held(c, tryggleik(), 'tryggleik').values()].every(Boolean)).toBe(true);
  });

  it('a frozen question keeps its definitions after a spelling fix, not after a new meaning', () => {
    const spelling = edit(tryggleik(), 'F5', (q) => (q.texts.text.nn = `${q.texts.text.nn} `));
    expect(held(spelling, tryggleik(), 'tryggleik').get('tryggleik.zone')).toBe(true);
    const meaning = edit(tryggleik(), 'F5', (q) => (q.anchor_key = 'F5~v3'));
    const after = held(meaning, tryggleik(), 'tryggleik');
    expect(after.get('tryggleik.zone')).toBe(false);
    expect(after.get('tryggleik.mean_score')).toBe(false);
    expect(after.get('tryggleik.f5.distribution')).toBe(false);
    expect(after.get('tryggleik.f6.distribution')).toBe(true);
  });

  it('a question that is not frozen keeps them only unchanged: new words are a question of its own', () => {
    // K7 has an anchor but no lock: nothing marks a change of its words.
    const reworded = edit(ki(), 'K7', (q) => (q.texts.text.nn = 'Kor ofte brukar du KI privat?'));
    const after = held(reworded, ki(), 'ki');
    expect(after.get('ki.k7.distribution')).toBe(false);
    expect(after.get('ki.k7_x_k8')).toBe(false);
    expect(after.get('ki.k8.distribution')).toBe(true);
    // K11 is shown by K7: it does not hold either.
    expect(after.get('ki.k11.distribution')).toBe(false);
  });

  it('what a question depends on must hold: new answers in K3 drop the questions built on it', () => {
    const changed = edit(ki(), 'K3', (q) => {
      const k3 = q as Extract<Q, { type: 'multi' }>;
      k3.options = k3.options.slice(1);
    });
    const after = held(changed, ki(), 'ki');
    expect(after.get('ki.k3.distribution')).toBe(false);
    expect(after.get('ki.k16.distribution')).toBe(false);
    expect(after.get('ki.heaviest_task')).toBe(false);
    expect(after.get('ki.routine_hours_week')).toBe(false);
    expect(after.get('ki.k1.distribution')).toBe(true);
  });

  it('a leader question needs the same leader roles', () => {
    const c = ki();
    c.leader_roles = ['leiar'];
    const after = held(c, ki(), 'ki');
    expect(after.get('ki.leiar_l2.distribution')).toBe(false);
    expect(after.get('ki.k1.distribution')).toBe(true);
  });
});
