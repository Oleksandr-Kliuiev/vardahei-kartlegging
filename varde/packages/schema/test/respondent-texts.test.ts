// 2.16: the texts a respondent meets, with stable keys; the seeded surveys have none empty, and an
// empty question or answer is found (a single scale row may stay without a label, B14).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { emptyTexts, respondentTexts } from '../src/template/respondent-texts.js';
import type { TemplateContent } from '../src/template/template.js';

const seed = (name: string) =>
  (
    JSON.parse(
      readFileSync(new URL(`../../../config/seed/templates/${name}.json`, import.meta.url), 'utf8'),
    ) as { content: TemplateContent }
  ).content;

it('the seeded surveys have no empty text a respondent would meet', () => {
  for (const name of ['tryggleik.2026-10-13', 'ki.2026-10-13'])
    expect(emptyTexts(seed(name)).map((t) => t.key)).toEqual([]);
});

it('keys follow ids, places read as in the workshop, and gaps are found', () => {
  const c = structuredClone(seed('tryggleik.2026-10-13'));
  const keys = respondentTexts(c).map((t) => t.key);
  expect(keys.slice(0, 2)).toEqual(['intro.title', 'intro.short']);
  expect(keys).toContain('q.F5.option.ja');
  expect(new Set(keys).size).toBe(keys.length);
  const f5 = c.questions.find((q) => q.id === 'F5')!;
  f5.texts.text.nn = ' ';
  if (f5.type === 'single') f5.options[1]!.texts.text.nn = '';
  expect(emptyTexts(c).map((t) => t.where)).toEqual(['F5: spørsmålet', 'F5: svar 2']);
  // Leader words are needed only while the leader part has questions.
  const plain = { ...c, questions: c.questions.filter((q) => q.part !== 'leader') };
  plain.leader_intro = { title: { nn: '' }, text: { nn: '' } };
  expect(emptyTexts(plain).map((t) => t.key)).not.toContain('leader.title');
});
