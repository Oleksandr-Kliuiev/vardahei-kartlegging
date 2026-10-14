// Options currently offered by a choice question (1.6, as kartlegging index.html::valAv):
// `option.visible_if` and, with `choices_from`, only the options chosen in the source question.
import type { Option, Question } from '@varde/schema/template/question';
import { evaluate } from './expression.js';
import type { Answers } from './types.js';

export function optionsFor(question: Question, answers: Answers): Option[] {
  if (question.type !== 'single' && question.type !== 'multi') return [];
  const from = question.choices_from;
  const source = from === undefined ? undefined : answers[from];
  const chosen = new Set(Array.isArray(source) ? source : []);
  return question.options.filter((o) => {
    if (o.visible_if !== undefined && !evaluate(o.visible_if, answers)) return false;
    return from === undefined || chosen.has(o.id);
  });
}
