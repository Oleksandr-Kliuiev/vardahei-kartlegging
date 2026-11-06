import { describe, expect, it } from 'vitest';
import { starterContent } from '../../src/modules/surveys/starters.js';
import { TemplateVersionContent } from '@varde/schema/template/validate';

const contact = {
  name: 'Test',
  phone: '00000000',
  email: 'test@example.invalid',
  hours: { nn: 'Test', en: 'Test' },
};
const sender = { nn: 'Test', en: 'Test' };
const base = {
  title: 'Demo',
  audience: 'client_survey' as const,
  required_languages: ['nn', 'en'] as const,
  contact,
  sender,
};
// starterContent leaves `key` empty; the caller (editor.service.ts) fills it in after, as here.
const valid = (c: ReturnType<typeof starterContent>) =>
  TemplateVersionContent.safeParse({ ...c, key: 'demo' });

describe('starterContent (2.16, decisions 5 and 6 of 17.10)', () => {
  it('initials + role (the default): Om deg on the initials question, role right after it', () => {
    const c = starterContent({
      ...base,
      identification: 'initials',
      with_role_question: true,
    });
    expect(c.questions.map((q) => [q.id, q.type, !!q.role, !!q.identifier])).toEqual([
      ['Q1', 'text', false, true],
      ['Q2', 'single', true, false],
      ['Q3', 'single', false, false],
    ]);
    expect(c.questions[0]!.texts.section_title).toEqual({ nn: 'Om deg', en: 'About you' });
    expect(valid(c).success).toBe(true);
  });
  it('no initials, role on: the role question itself carries Om deg', () => {
    const c = starterContent({ ...base, identification: 'none', with_role_question: true });
    expect(c.questions.map((q) => [q.id, !!q.role])).toEqual([
      ['Q1', true],
      ['Q2', false],
    ]);
    expect(c.questions[0]!.texts.section_title).toEqual({ nn: 'Om deg', en: 'About you' });
    expect(valid(c).success).toBe(true);
  });
  it('role off: no role question at all, no Om deg section (nothing structural left)', () => {
    const c = starterContent({ ...base, identification: 'none', with_role_question: false });
    expect(c.questions.map((q) => [q.id, !!q.role])).toEqual([['Q1', false]]);
    expect(c.questions[0]!.texts.section_title).toEqual({ nn: 'Spørsmål', en: 'Questions' });
    const r = valid(c);
    expect(r.success, JSON.stringify(!r.success && r.error.issues)).toBe(true);
  });
  it('role off, initials on: the initials question keeps Om deg, no role question', () => {
    const c = starterContent({ ...base, identification: 'initials', with_role_question: false });
    expect(c.questions.map((q) => [q.id, !!q.role, !!q.identifier])).toEqual([
      ['Q1', false, true],
      ['Q2', false, false],
    ]);
    expect(c.questions[0]!.texts.section_title).toEqual({ nn: 'Om deg', en: 'About you' });
    expect(valid(c).success).toBe(true);
  });
});
