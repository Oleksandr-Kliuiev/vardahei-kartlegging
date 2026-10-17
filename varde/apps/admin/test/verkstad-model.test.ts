import { expect, it } from 'vitest';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import {
  NODE,
  addSection,
  changeType,
  frozenChanges,
  insertQuestion,
  issueNode,
  markFrozen,
  missingIn,
  moveBy,
  moveQuestion,
  newQuestion,
  nextId,
  removeQuestion,
  restoreQuestion,
  revertFrozen,
  sectionsOf,
  setIdentification,
  setSectionTitle,
  whereOf,
} from '../src/verkstad-model.js';
import {
  conditionWords,
  expressionWords,
  readCondition,
  sourcesFor,
  writeCondition,
} from '../src/verkstad-vilkar.js';
import { editorFixture } from './editor-fixture.js';

const t = (nn: string) => ({ nn, en: nn });
const q = (id: string, extra: Partial<Question> = {}): Question =>
  ({
    id,
    type: 'single',
    part: 'common',
    texts: { text: t(`Spørsmål ${id}`) },
    options: [
      { id: 'ja', texts: { text: t('Ja') } },
      { id: 'nei', texts: { text: t('Nei') } },
    ],
    ...extra,
  }) as Question;
const titled = (id: string, title: string, extra: Partial<Question> = {}) =>
  q(id, { ...extra, texts: { text: t(`Spørsmål ${id}`), section_title: t(title) } });
function content(): TemplateContent {
  return {
    ...editorFixture().content,
    questions: [
      titled('A1', 'Alfa', { role: true }),
      q('A2'),
      titled('B1', 'Beta', { frozen: true, anchor_key: 'B1' }),
      q('B2', { type: 'multi' }),
      q('L1', { part: 'leader' }),
      q('L2', { part: 'leader' }),
    ],
  };
}
const ids = (c: TemplateContent) => c.questions.map((x) => x.id);
const titles = (c: TemplateContent) => sectionsOf(c).map((s) => s.title?.nn ?? '–');

it('sections follow section titles; the leader part stays apart and last', () => {
  const c = content();
  expect(sectionsOf(c).map((s) => s.questions.map((x) => x.id))).toEqual([
    ['A1', 'A2'],
    ['B1', 'B2'],
  ]);
  expect(titles(c)).toEqual(['Alfa', 'Beta']);
});
it('moving keeps every section title on the first question of its section', () => {
  const c = content();
  // The first question of «Beta» moves up: it ends «Alfa», and B2 now carries «Beta».
  const up = moveBy(c, 'B1', -1);
  expect(ids(up)).toEqual(['A1', 'A2', 'B1', 'B2', 'L1', 'L2']);
  expect(sectionsOf(up).map((s) => s.questions.map((x) => x.id))).toEqual([
    ['A1', 'A2', 'B1'],
    ['B2'],
  ]);
  expect(titles(up)).toEqual(['Alfa', 'Beta']);
  expect(up.questions.find((x) => x.id === 'B1')!.texts.section_title).toBeUndefined();
  // The last question of «Alfa» moves down: it starts «Beta» and takes the title.
  const down = moveBy(c, 'A2', 1);
  expect(sectionsOf(down).map((s) => s.questions.map((x) => x.id))).toEqual([
    ['A1'],
    ['A2', 'B1', 'B2'],
  ]);
  expect(down.questions.find((x) => x.id === 'A2')!.texts.section_title?.nn).toBe('Beta');
  expect(moveBy(c, 'A1', -1)).toBe(c);
  expect(ids(moveBy(c, 'L1', 1))).toEqual(['A1', 'A2', 'B1', 'B2', 'L2', 'L1']);
});
it('a section that loses its last question goes; later section indices stay as they were', () => {
  const c = moveQuestion(content(), 'A2', { in: 0, before: 'A1' });
  expect(ids(c)).toEqual(['A2', 'A1', 'B1', 'B2', 'L1', 'L2']);
  expect(titles(c)).toEqual(['Alfa', 'Beta']);
  const lone = addSection(content(), 0, t('Ny'), q('N1'));
  expect(titles(lone)).toEqual(['Alfa', 'Ny', 'Beta']);
  // N1 leaves the middle section for «Beta» (index 2 before the move); «Ny» disappears.
  const moved = moveQuestion(lone, 'N1', { in: 2, before: 'B2' });
  expect(titles(moved)).toEqual(['Alfa', 'Beta']);
  expect(sectionsOf(moved)[1]!.questions.map((x) => x.id)).toEqual(['B1', 'N1', 'B2']);
  expect(titles(removeQuestion(lone, 'N1'))).toEqual(['Alfa', 'Beta']);
});
it('a deleted question comes back to its section and neighbours, also after other edits', () => {
  const c = content();
  for (const id of ['A2', 'B1', 'B2', 'L1']) {
    const gone = removeQuestion(c, id);
    expect(restoreQuestion(gone, c, id)).toEqual(c);
    // Another edit in between: the title of «Alfa» changes.
    const back = restoreQuestion(setSectionTitle(gone, 0, 'nn', 'Alfa 2'), c, id);
    expect(ids(back)).toEqual(ids(c));
    expect(titles(back)).toEqual(['Alfa 2', 'Beta']);
  }
  // Alone in its section: the section comes back between the same neighbours.
  const lone = addSection(content(), 0, t('Ny'), q('N1'));
  expect(titles(restoreQuestion(removeQuestion(lone, 'N1'), lone, 'N1'))).toEqual([
    'Alfa',
    'Ny',
    'Beta',
  ]);
  expect(restoreQuestion(c, c, 'A2')).toBe(c);
});
it('identification adds the initials question first and takes it away again; a frozen one stays', () => {
  const c = content();
  const initials = setIdentification(c, 'initials');
  expect(initials.identification).toBe('initials');
  expect(initials.questions[0]).toMatchObject({ id: 'Q7', type: 'text', identifier: true });
  expect(titles(initials)).toEqual(['Alfa', 'Beta']);
  expect(sectionsOf(initials)[0]!.questions.map((x) => x.id)).toEqual(['Q7', 'A1', 'A2']);
  expect(setIdentification(initials, 'none')).toEqual(c);
  expect(setIdentification(initials, 'initials')).toBe(initials);
  const fixed = {
    ...initials,
    questions: initials.questions.map((x) => (x.identifier ? { ...x, frozen: true as const } : x)),
  };
  expect(setIdentification(fixed, 'none').questions.some((x) => x.identifier)).toBe(true);
});
it('frozen, role and initials questions never move into the leader part', () => {
  const c = content();
  expect(moveQuestion(c, 'B1', { in: 'leader' })).toBe(c);
  expect(moveQuestion(c, 'A1', { in: 'leader' })).toBe(c);
  const led = moveQuestion(c, 'A2', { in: 'leader', before: 'L2' });
  expect(led.questions.find((x) => x.id === 'A2')!.part).toBe('leader');
  expect(ids(led)).toEqual(['A1', 'B1', 'B2', 'L1', 'A2', 'L2']);
});
it('new questions, sections, ids and types', () => {
  const c = insertQuestion(content(), newQuestion('single', nextId(content()), ['nn', 'en']), {
    in: 1,
    before: 'B2',
  });
  expect(ids(c)).toEqual(['A1', 'A2', 'B1', 'Q7', 'B2', 'L1', 'L2']);
  // A deleted or published id is never given again.
  expect(nextId(removeQuestion(c, 'Q7'), ['Q7'])).toBe('Q8');
  expect(nextId(c, ['Q12', 'F30'])).toBe('Q13');
  expect(titles(setSectionTitle(c, 1, 'nn', 'Beta 2'))).toEqual(['Alfa', 'Beta 2']);
  for (const type of ['single', 'multi', 'text', 'scale', 'nps'] as const) {
    const fresh = newQuestion(type, 'Q', ['nn', 'en', 'nb']);
    expect(fresh.type).toBe(type);
    expect(Object.keys(fresh.texts.text)).toEqual(['nn', 'en', 'nb']);
  }
  const multi = changeType(q('X', { required: true }), 'multi', ['nn']);
  expect(multi).toMatchObject({ type: 'multi', required: true });
  expect('options' in multi && multi.options.map((o) => o.id)).toEqual(['ja', 'nei']);
  expect(changeType(q('X'), 'text', ['nn'])).toMatchObject({
    type: 'text',
    texts: { text: t('Spørsmål X') },
  });
});
it('frozen changes: moving is no change; spelling keeps the anchor, a new meaning gets a new one', () => {
  const base = content();
  expect(frozenChanges(base, moveBy(base, 'B1', -1))).toEqual([]);
  const changed = structuredClone(base);
  changed.questions[2]!.texts.text.nn = 'Spørsmål B1 (retta)';
  const [change] = frozenChanges(base, changed);
  expect(change).toMatchObject({ id: 'B1', semantic: false });
  const spelling = markFrozen(changed, base, 'B1', 'orthographic', 3);
  expect(spelling.questions[2]!.anchor_key).toBe('B1');
  const meaning = markFrozen(changed, base, 'B1', 'semantic', 3);
  expect(meaning.questions[2]!.anchor_key).toBe('B1~v3');
  expect(frozenChanges(base, meaning)[0]!.semantic).toBe(true);
  expect(frozenChanges(base, revertFrozen(meaning, base, 'B1'))).toEqual([]);
});
it('missing translations and where an issue belongs', () => {
  const c = content();
  delete c.questions[1]!.texts.text.en;
  expect(missingIn(c, 'en').map((m) => m.where)).toEqual(['A2: spørsmål']);
  expect(missingIn(c, 'nn')).toEqual([]);
  expect(issueNode(c, ['questions', 2, 'texts', 'text'])).toBe('B1');
  expect(issueNode(c, ['intro', 'contact', 'name'])).toBe(NODE.intro);
  expect(issueNode(c, ['leader_roles', 0])).toBe(NODE.leader);
  expect(issueNode(c, ['questions'])).toBe(NODE.settings);
  // Places in words, never schema paths.
  expect(whereOf(c, ['questions', 1, 'options', 1, 'texts', 'text', 'en'])).toBe('A2: svar 2');
  expect(whereOf(c, ['questions', 2, 'texts', 'help', 'nn'])).toBe('B1: hjelpeteksten');
  expect(whereOf(c, ['questions', 3, 'visible_if'])).toBe('B2: vilkåret');
  expect(whereOf(c, ['intro', 'contact', 'email'])).toBe('Kontakt: e-post');
  expect(whereOf(c, ['intro', 'letter', 0, 'en'])).toBe('Avsnitt 1');
  expect(whereOf(c, ['invitation', 'poster', 'footer', 'nn'])).toBe('Plakat: botntekst');
  expect(whereOf(c, [])).toBe('Skjemaet');
});
it('conditions: the simple forms round-trip, read as Nynorsk, and use only earlier choice questions', () => {
  const c = content();
  for (const e of [
    { '==': [{ var: 'A1' }, 'ja'] },
    { '!=': [{ var: 'A1' }, 'ja'] },
    { in: [{ var: 'A1' }, ['ja', 'nei']] },
    { in: ['ja', { var: 'B2' }] },
    { '!': [{ in: ['ja', { var: 'B2' }] }] },
    { or: [{ '==': [{ var: 'A1' }, 'ja'] }, { in: ['nei', { var: 'B2' }] }] },
  ]) {
    const read = readCondition(e);
    expect(read).not.toBe('avansert');
    expect(writeCondition(read as Exclude<typeof read, 'avansert' | null>)).toEqual(e);
  }
  const words = conditionWords(c, { logic: 'og', rules: [{ q: 'A1', op: 'er', v: ['nei'] }] });
  expect(words).toBe('Blir berre vist når A1 «Spørsmål A1» er «Nei».');
  expect(writeCondition({ logic: 'og', rules: [{ q: '', op: 'er', v: [] }] })).toBeUndefined();
  expect(readCondition({ '>=': [{ count: [{ var: 'B2' }] }, 2] })).toBe('avansert');
  expect(expressionWords(c, { '>=': [{ count: [{ var: 'B2' }] }, 2] })).toBe(
    'Blir berre vist når minst 2 val i B2.',
  );
  expect(sourcesFor(c, c.questions[3]!).map((x) => x.id)).toEqual(['A1', 'A2', 'B1']);
  expect(sourcesFor(c, c.questions[4]!).map((x) => x.id)).toEqual(['A1', 'A2', 'B1', 'B2']);
});
