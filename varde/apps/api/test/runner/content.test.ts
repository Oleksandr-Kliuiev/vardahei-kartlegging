import { expect, it } from 'vitest';
import { languageContent } from '../../src/modules/rounds/runner-content.js';

it('only enabled translations leave the API, including nested question options', () => {
  const content = { key: 'synthetic', intro: { title: { nn: 'Hei', en: 'Hi', nb: 'Hei nb' } },
    questions: [{ id: 'Q1', options: [{ id: 'a', texts: { text: { nn: 'Ja', en: 'Yes', nb: 'Ja nb' } } }] }],
  };
  expect(languageContent(content, ['nn', 'en'])).toEqual({
    key: 'synthetic', intro: { title: { nn: 'Hei', en: 'Hi' } },
    questions: [{ id: 'Q1', options: [{ id: 'a', texts: { text: { nn: 'Ja', en: 'Yes' } } }] }],
  });
  expect(content.intro.title.nb).toBe('Hei nb');
});
