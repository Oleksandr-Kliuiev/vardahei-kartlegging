// 3.1: the standard guide says for each of its 27 questions when it is Ivaretatt, Forbetringspotensial or
// Manglar; a guide made before that gets them in its next draft, a guide with any criterion keeps its own.
import { describe, expect, it } from 'vitest';
import { CRITERION_MAX_LENGTH } from '@varde/schema/template/criteria';
import type { TemplateContent } from '@varde/schema/template/template';
import { TemplateVersionContent } from '@varde/schema/template/validate';
import {
  interviewGuideQuestions,
  withStandardCriteria,
} from '../../src/modules/surveys/interview-guide.js';
import { starterContent } from '../../src/modules/surveys/starters.js';

const KEYS = ['criteria_ivaretatt', 'criteria_forbetring', 'criteria_manglar'] as const;
const guide = (): TemplateContent => ({
  ...starterContent({
    title: 'Kartlegging nøkkelpersonar',
    audience: 'interview',
    identification: 'none',
    required_languages: ['nn'],
    contact: {
      name: 'Vardahei IT',
      phone: '0',
      email: 'post@example.invalid',
      hours: { nn: '8–16' },
    },
    sender: { nn: 'Vardahei IT' },
    with_role_question: false,
  }),
  key: 'nokkelpersonar',
});
const without = (c: TemplateContent): TemplateContent => ({
  ...c,
  questions: c.questions.map((q) => {
    const texts = { ...q.texts };
    for (const key of KEYS) delete texts[key];
    return { ...q, texts };
  }),
});

describe('the criteria of the standard guide (3.1)', () => {
  it('all three for each of the 27 questions, within the limit, and the guide stays valid', () => {
    const questions = interviewGuideQuestions();
    expect(questions).toHaveLength(27);
    for (const q of questions)
      for (const key of KEYS) {
        expect(q.texts[key]?.nn.trim(), `${q.id} ${key}`).toBeTruthy();
        expect(q.texts[key]!.nn.length).toBeLessThanOrEqual(CRITERION_MAX_LENGTH);
      }
    expect(questions.find((q) => q.id === 'N28')!.texts.criteria_manglar).toEqual({
      nn: 'Dei tilsette veit ikkje kven dei skal kontakte.',
    });
    expect(TemplateVersionContent.safeParse(guide()).success).toBe(true);
  });

  it('a guide without any criterion gets them in its next draft, by question id', () => {
    const old = without(guide());
    old.questions.push({
      id: 'X1',
      type: 'text',
      part: 'common',
      texts: { text: { nn: 'Eige?' } },
    });
    const next = withStandardCriteria(old);
    expect(next.questions.find((q) => q.id === 'N2')!.texts.criteria_ivaretatt).toEqual({
      nn: 'Éin namngitt ansvarleg med stadfortredar, og dei tilsette veit kven det er.',
    });
    expect(next.questions.filter((q) => q.texts.criteria_manglar).length).toBe(27);
    expect(next.questions.find((q) => q.id === 'X1')!.texts).toEqual({ text: { nn: 'Eige?' } });
    expect(TemplateVersionContent.safeParse(next).success).toBe(true);
  });

  it('a guide with any criterion, or a survey that is no guide, is left as it is', () => {
    const own = without(guide());
    own.questions[3]!.texts.criteria_forbetring = { nn: 'Eigne ord.' };
    expect(withStandardCriteria(own)).toBe(own);
    const survey = { ...without(guide()), audience: 'client_survey' as const };
    expect(withStandardCriteria(survey)).toBe(survey);
  });
});
