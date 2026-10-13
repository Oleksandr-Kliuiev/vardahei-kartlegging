// Task 1.1: the zod schema of a TemplateVersion and its consistency checks (ADR-005, ADR-019, ADR-025).
import { describe, expect, it } from 'vitest';
import { checkExpression } from '../src/template/expression.js';
import { TemplateVersionContent } from '../src/template/validate.js';
import { minimalTemplate, nested } from './support/template.js';

type Tpl = ReturnType<typeof minimalTemplate>;
const q = (tpl: Tpl, id: string) =>
  tpl.questions.find((x) => x.id === id) as Record<string, unknown>;
const ok = (tpl: unknown) => TemplateVersionContent.safeParse(tpl);
const rejected = (tpl: unknown, pattern?: RegExp) => {
  const r = ok(tpl);
  expect(r.success).toBe(false);
  if (!r.success && pattern)
    expect(r.error.issues.map((i) => i.message).join('\n')).toMatch(pattern);
};
const edit = (fn: (t: Tpl) => void): Tpl => {
  const tpl = minimalTemplate();
  fn(tpl);
  return tpl;
};

describe('TemplateVersion schema (1.1)', () => {
  it('a minimal valid template parses and defaults to identification initials', () => {
    const r = ok(minimalTemplate());
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(r.data?.identification).toBe('initials');
  });

  it('unknown operator → rejected', () => {
    rejected(
      edit((t) => (q(t, 'Q4').visible_if = { regex: [{ var: 'Q2' }, 'x'] })),
      /unknown operator/,
    );
  });

  it('depth 6 → ok, depth 7 → rejected', () => {
    expect(checkExpression(nested(6))).toEqual([]);
    rejected(
      edit((t) => (q(t, 'Q4').visible_if = nested(7))),
      /deeper than 6/,
    );
  });

  it('dangling reference → rejected', () => {
    rejected(
      edit((t) => (q(t, 'Q4').visible_if = { '==': [{ var: 'Q9' }, 'x'] })),
      /unknown question Q9/,
    );
  });

  it('visible_if cycle → rejected', () => {
    rejected(
      edit((t) => {
        q(t, 'Q3').visible_if = { in: ['ja', { var: 'Q4' }] };
        q(t, 'Q4').visible_if = { in: ['a', { var: 'Q3' }] };
      }),
      /cycle/,
    );
  });

  it('initials without identifier and with two → rejected', () => {
    rejected(
      edit((t) => delete q(t, 'Q1').identifier),
      /exactly one identifier/,
    );
    rejected(
      edit((t) => t.questions.push({ ...q(t, 'Q1'), id: 'Q5' })),
      /exactly one identifier/,
    );
  });

  it('identifier longer than 8 → rejected', () => {
    rejected(
      edit((t) => (q(t, 'Q1').max_length = 9)),
      /≤ 8/,
    );
  });

  it('none with an identifier → rejected; none without → ok', () => {
    rejected(
      edit((t) => (t.identification = 'none')),
      /none has no identifier/,
    );
    const anon = edit((t) => {
      t.identification = 'none';
      t.questions.shift();
    });
    expect(ok(anon).success).toBe(true);
  });

  it('score 4 and −1 → rejected', () => {
    const opts = (t: Tpl) => q(t, 'Q4').options as { score?: number }[];
    rejected(edit((t) => ((opts(t)[0] as { score: number }).score = 4)));
    rejected(edit((t) => ((opts(t)[0] as { score: number }).score = -1)));
  });

  it('client_survey without nn or without en → rejected', () => {
    rejected(
      edit((t) => (t.required_languages = ['en'])),
      /requires nn/,
    );
    rejected(
      edit((t) => (t.required_languages = ['nn'])),
      /requires en/,
    );
  });

  it('seminar_live with nn only → ok', () => {
    const tpl = edit((t) => {
      t.audience = 'seminar_live';
      t.required_languages = ['nn'];
    });
    expect(ok(tpl).success).toBe(true);
  });

  it('text without en when required_languages is [nn, en] → rejected', () => {
    rejected(
      edit((t) => (q(t, 'Q2').texts = { text: { nn: 'Rolle' } })),
      /missing en/,
    );
  });

  it('admin-facing short_label is nn only; a respondent text still needs en', () => {
    const r = ok(
      edit(
        (t) => (q(t, 'Q2').texts = { text: { nn: 'R', en: 'R' }, short_label: { nn: 'Rolle' } }),
      ),
    );
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('choices_from: source single or later in order → rejected', () => {
    rejected(
      edit((t) => (q(t, 'Q4').choices_from = 'Q2')),
      /multi question earlier/,
    );
    rejected(
      edit((t) => {
        t.questions.splice(2, 0, {
          ...q(t, 'Q4'),
          id: 'Q0',
          part: 'common',
          choices_from: 'Q3',
          visible_if: undefined,
        });
      }),
      /multi question earlier/,
    );
  });

  it('single question with a multi source (as K16 ← K3) → ok', () => {
    const tpl = edit((t) =>
      t.questions.push({
        id: 'Q5',
        part: 'common',
        type: 'single',
        choices_from: 'Q3',
        texts: { text: { nn: 'Mest tid', en: 'Most time' } },
        options: [
          { id: 'a', texts: { text: { nn: 'A', en: 'A' } } },
          { id: 'b', texts: { text: { nn: 'B', en: 'B' } } },
        ],
      }),
    );
    const r = ok(tpl);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('frozen without anchor_key → rejected; exclusive option outside options → rejected', () => {
    rejected(
      edit((t) => (q(t, 'Q2').frozen = true)),
      /anchor_key/,
    );
    rejected(
      edit((t) => (q(t, 'Q3').exclusive_options = ['x'])),
      /unknown option x/,
    );
  });

  it('no role question or a leader role outside its options → rejected', () => {
    rejected(
      edit((t) => delete q(t, 'Q2').role),
      /exactly one role/,
    );
    rejected(
      edit((t) => (t.leader_roles = ['sjef'])),
      /leader role sjef/,
    );
  });

  it('var inside some/count names the element; outside it names a question', () => {
    expect(checkExpression({ some: [{ var: 'Q3' }, { '!=': [{ var: '' }, 'ingen'] }] })).toEqual(
      [],
    );
    expect(checkExpression({ count: [{ var: 'K12' }, { '<=': [{ var: 'rad.x' }, 2] }] })).toEqual(
      [],
    );
    expect(checkExpression({ '==': [{ var: '' }, 'x'] })).not.toEqual([]);
    expect(checkExpression({ some: [{ var: 'Q3' }, { var: 'Q2' }] })).not.toEqual([]);
  });
});
