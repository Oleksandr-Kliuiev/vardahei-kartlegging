// Decision 5 (17.10): the role and initials questions a survey's structure needs pass the schema as
// they are, in nynorsk and english; other languages are left to the workshop.
import { expect, it } from 'vitest';
import { initialsQuestion, roleQuestion } from '../src/template/structure.js';
import { TemplateVersionContent } from '../src/template/validate.js';
import { minimalTemplate } from './support/template.js';

it('a survey of only the structural questions is a valid template, with initials or anonymous', () => {
  const langs = ['nn', 'en'] as const;
  const withInitials = {
    ...minimalTemplate(),
    identification: 'initials',
    questions: [initialsQuestion('Q1', langs), roleQuestion('Q2', langs)],
  };
  const r = TemplateVersionContent.safeParse(withInitials);
  expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  const anonymous = {
    ...withInitials,
    identification: 'none',
    questions: [roleQuestion('Q1', langs)],
  };
  expect(TemplateVersionContent.safeParse(anonymous).success).toBe(true);
  // A language without approved texts gets an empty text, written in the workshop before publishing
  // (2.16 acceptance, L2): the key is there, so the survey is complete apart from the translation.
  const bokmal = roleQuestion('Q1', ['nn', 'nb']);
  expect(bokmal.texts.text).toEqual({ nn: 'Kva rolle har du i bedrifta?', nb: '' });
});
