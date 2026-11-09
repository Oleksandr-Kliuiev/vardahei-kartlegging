// Duplicating a question (2.16). Pure: it takes the content and gives a new one back, so the page
// only has to pick the new id and move the cursor to it. What makes a question the one it is —
// whether it is frozen, its anchor in the metrics, the role question, the identifier — never comes
// along: the copy is a new question that happens to read the same.
import { insertQuestion, leaderOf, sectionsOf, type Place } from './verkstad-model.js';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';

export function duplicatedInto(c: TemplateContent, q: Question, id: string): TemplateContent {
  const copy = JSON.parse(JSON.stringify(q)) as Question & Record<string, unknown>;
  delete copy.frozen;
  delete copy.anchor_key;
  delete copy.role;
  delete copy.identifier;
  const where =
    q.part === 'leader' ? 'leader' : sectionsOf(c).findIndex((s) => s.questions.includes(q));
  const list = where === 'leader' ? leaderOf(c) : (sectionsOf(c)[where]?.questions ?? []);
  const after = list[list.indexOf(q) + 1];
  const place: Place = { in: where, ...(after ? { before: after.id } : {}) };
  return insertQuestion(c, { ...copy, id }, place);
}
