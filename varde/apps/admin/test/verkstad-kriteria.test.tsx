// 3.1 in the workshop: a question of a conversation guide shows its three criteria where a survey
// question has its answers; they save as the other texts do, an emptied one leaves the question, and the
// field stops at the schema's limit. A published guide shows them read-only.
import { expect, it } from 'vitest';
import type { Question } from '../../../packages/schema/src/template/question.js';
import { respondentTexts } from '../../../packages/schema/src/template/respondent-texts.js';
import { schemaMessage } from '../src/schema-message.js';
import type { EditorVersion } from '../src/survey-models.js';
import { withText } from '../src/verkstad-tekst.js';
import { choose, open, serve, type, versions, wait, workshopTests } from './verkstad-support.js';

workshopTests();

const nn = (text: string) => ({ nn: text });
/** A published guide and its draft: N2 with criteria, N3 without. */
function guide(status = 'draft'): Record<string, EditorVersion> {
  const store = versions(status);
  for (const v of Object.values(store)) {
    v.required_languages = ['nn'];
    v.content = {
      ...v.content,
      audience: 'interview',
      identification: 'none',
      required_languages: ['nn'],
      leader_roles: [],
      questions: [
        {
          id: 'N2',
          type: 'text',
          part: 'common',
          texts: {
            text: nn('Kven har ansvaret for IT?'),
            section_title: nn('Ansvar og rolle'),
            criteria_ivaretatt: nn('Éin namngitt ansvarleg.'),
            criteria_forbetring: nn('Nokon tek det i praksis.'),
            criteria_manglar: nn('Ingen har ansvaret.'),
          },
        },
        {
          id: 'N3',
          type: 'text',
          part: 'common',
          texts: { text: nn('Blir dei tilsette informerte?') },
        },
      ] as Question[],
    };
  }
  return store;
}
const field = (div: HTMLElement, label: string) => {
  const l = [...div.querySelectorAll('label')].find((x) => x.textContent === label);
  if (!l) throw new Error(`missing field ${label}`);
  return document.getElementById(l.htmlFor) as HTMLTextAreaElement;
};
const LABELS = ['Ivaretatt når …', 'Forbetringspotensial når …', 'Manglar når …'];

it('the three criteria stand where the answers would, and stop at the limit', async () => {
  serve(guide());
  const div = await open();
  choose(div, 'N2');
  expect(LABELS.map((l) => field(div, l).value)).toEqual([
    'Éin namngitt ansvarleg.',
    'Nokon tek det i praksis.',
    'Ingen har ansvaret.',
  ]);
  expect(LABELS.map((l) => field(div, l).maxLength)).toEqual([200, 200, 200]);
  const group = div.querySelector('.vk-kriteria')!;
  expect(group.getAttribute('role')).toBe('group');
  expect(document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent).toBe(
    'Vurdering',
  );
  // A guide has no answer field settings and no answers to edit.
  expect(div.textContent).not.toContain('Svarfelt');
});

it('a criterion saves like any text; an emptied one leaves the question', async () => {
  const api = serve(guide());
  const div = await open();
  choose(div, 'N3');
  type(field(div, 'Forbetringspotensial når …'), 'Av og til, munnleg.');
  await wait(800);
  const first = api.puts().at(-1)!.body.content!.questions;
  expect(first.find((q) => q.id === 'N3')!.texts).toEqual({
    text: nn('Blir dei tilsette informerte?'),
    criteria_forbetring: nn('Av og til, munnleg.'),
  });
  choose(div, 'N2');
  type(field(div, 'Ivaretatt når …'), '');
  await wait(800);
  const n2 = api
    .puts()
    .at(-1)!
    .body.content!.questions.find((q) => q.id === 'N2')!.texts;
  expect('criteria_ivaretatt' in n2).toBe(false);
  expect(n2.criteria_manglar).toEqual(nn('Ingen har ansvaret.'));
});

it('a published guide shows its criteria read-only', async () => {
  serve(guide('published'));
  const div = await open('base');
  choose(div, 'N2');
  expect(LABELS.map((l) => field(div, l).readOnly)).toEqual([true, true, true]);
});

it('the criteria are texts of the guide: listed, writable, and named in Nynorsk when wrong', () => {
  const c = guide().version!.content;
  const keys = respondentTexts(c).filter((r) => r.key.includes('criteria'));
  expect(keys.map((r) => r.where)).toEqual(LABELS.map((l) => `N2: ${l}`));
  for (const r of keys) expect(withText(c, r.key, 'nn', 'x')).not.toBe(c);
  expect(schemaMessage('criterion manglar of N2 is over 200 characters')).toBe(
    'Teksten i «Manglar når …» er for lang: skriv høgst 200 teikn.',
  );
  expect(schemaMessage('criteria belong to a conversation guide (Q5)')).toBe(
    'Kriterium for vurderinga høyrer berre til ein samtaleguide.',
  );
});
