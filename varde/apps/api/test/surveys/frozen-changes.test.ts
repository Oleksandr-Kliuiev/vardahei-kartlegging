// 2.16 acceptance (unit): what the server counts as a change of a frozen question (ADR-005). Moving a
// question and the section it opens are no change; its wording, help and answers are, and need a mark.
import { describe, expect, it } from 'vitest';
import type { TemplateContent } from '@varde/schema/template/template';
import { frozenChanges } from '../../src/modules/surveys/publish.service.js';
import { structureOf } from '../../src/modules/surveys/question-structure.js';
import { seedContent } from '../support/seed-dir.js';

type Q = TemplateContent['questions'][number];
const base = () => seedContent('tryggleik.2026-10-13') as unknown as TemplateContent;
function edit(id: string, change: (q: Q & Record<string, unknown>) => void) {
  const c = base();
  change(c.questions.find((q) => q.id === id)!);
  return c;
}

describe('frozen questions (ADR-005)', () => {
  it('a move, a section title moved to another question or renamed: no change', () => {
    const c = base();
    const at = (k: string) => c.questions.findIndex((q) => q.id === k);
    const title = c.questions[at('F8')]!.texts.section_title!;
    delete c.questions[at('F8')]!.texts.section_title;
    const [f7] = c.questions.splice(at('F7'), 1);
    f7!.texts.section_title = { ...title, nn: `${title.nn} (ny)` };
    c.questions.splice(at('F8'), 0, f7!);
    expect(frozenChanges(base(), c)).toEqual([]);
  });

  it.each([
    ['the wording', (q: Q) => (q.texts.text.nn = `${q.texts.text.nn}!`)],
    ['the English wording', (q: Q) => (q.texts.text.en = `${q.texts.text.en ?? ''}!`)],
    ['the help text', (q: Q) => (q.texts.help = { nn: 'Ny hjelp', en: 'New help' })],
    ['the label of an answer', (q: Q) => 'options' in q && (q.options[0]!.texts.text.nn = 'Ja!')],
  ])('%s of F5 needs a mark', (_, change) => {
    const c = edit('F5', change);
    expect(() => frozenChanges(base(), c)).toThrow(/F5 changed without a mark/);
    expect(frozenChanges(base(), c, { F5: 'orthographic' })).toEqual([
      { id: 'F5', kind: 'orthographic' },
    ]);
  });
  // An answer change needs a mark, and only «semantic» with a new anchor fits it: a spelling fix
  // changes words only (2.16 acceptance, M2).
  it.each([
    [
      'the score of an answer',
      (q: Q) => 'options' in q && (q.options[1]!.score = (q.options[1]!.score ?? 0) + 1),
    ],
    ['an answer removed', (q: Q) => 'options' in q && q.options.pop()],
  ])('%s of F5 needs a mark, and it is never a spelling fix', (_, change) => {
    const c = edit('F5', change);
    expect(() => frozenChanges(base(), c)).toThrow(/F5 changed without a mark/);
    expect(() => frozenChanges(base(), c, { F5: 'orthographic' })).toThrow(/changes words only/);
    c.questions.find((q) => q.id === 'F5')!.anchor_key = 'F5b';
    expect(frozenChanges(base(), c, { F5: 'semantic' })).toEqual([{ id: 'F5', kind: 'semantic' }]);
  });

  it('a frozen question stays frozen: without the flag no later version would check it', () => {
    const c = edit('F5', (q) => delete q.frozen);
    expect(() => frozenChanges(base(), c)).toThrow(/F5 stays frozen/);
    expect(() => frozenChanges(base(), c, { F5: 'semantic' })).toThrow(/F5 stays frozen/);
  });

  it('the structure of a question leaves its words out, never its answers', () => {
    const q = () => base().questions.find((x) => x.id === 'F5')!;
    const words = q();
    words.texts.text.nn = 'Heilt nye ord?';
    words.texts.help = { nn: 'Hjelp', en: 'Help' };
    if ('options' in words) words.options[0]!.texts.text.en = 'Yes!';
    expect(structureOf(words)).toBe(structureOf(q()));
    const score = q();
    if ('options' in score) score.options[0]!.score = 3;
    expect(structureOf(score)).not.toBe(structureOf(q()));
    const option = q();
    if ('options' in option) option.options[0]!.id = 'heilt';
    expect(structureOf(option)).not.toBe(structureOf(q()));
  });

  it('orthographic keeps the anchor, semantic takes a new one; a frozen question stays', () => {
    const c = edit('F5', (q) => {
      q.texts.text.nn = 'Eit anna spørsmål?';
      q.anchor_key = 'F5b';
    });
    expect(() => frozenChanges(base(), c, { F5: 'orthographic' })).toThrow(/keeps anchor_key/);
    expect(frozenChanges(base(), c, { F5: 'semantic' })).toEqual([{ id: 'F5', kind: 'semantic' }]);
    const same = edit('F5', (q) => (q.texts.text.nn = 'Eit anna spørsmål?'));
    expect(() => frozenChanges(base(), same, { F5: 'semantic' })).toThrow(/new anchor_key/);
    const gone = base();
    gone.questions = gone.questions.filter((q) => q.id !== 'F5');
    expect(() => frozenChanges(base(), gone, { F5: 'semantic' })).toThrow(/F5 removed/);
  });
});
