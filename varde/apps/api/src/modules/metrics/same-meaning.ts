// When the template's own metric definitions hold for a version made in the workshop (2.16, after
// its acceptance and review): every question a definition reads must mean what it meant in a
// version the definitions were made for (ADR-005, ADR-020).
//
// - A frozen question: the same anchor and the same structure (`structureOf`); its words may change
//   only as a spelling fix, which the publication rules mark and check.
// - Any other question: exactly the same, apart from its section title — nothing marks or checks a
//   change of its words, so a changed wording is a question of its own.
// - What a question depends on must hold too: the questions in its condition and the one it takes
//   its answers from (`choices_from`). A leader question also needs the same leader roles.
import type { Question } from '@varde/schema/template/question';
import type { TemplateContent } from '@varde/schema/template/template';
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import { canonical } from '../surveys/hashes.js';
import { structureOf } from '../surveys/question-structure.js';

/** A version the template's definitions were made for: its questions by id, its leader roles. */
export interface ReferenceVersion {
  questions: ReadonlyMap<string, Question>;
  roles: string;
}
export const referenceOf = (c: TemplateContent): ReferenceVersion => ({
  questions: new Map(c.questions.map((q) => [q.id, q])),
  roles: canonical([...c.leader_roles].sort()),
});

const exactly = (q: Question) =>
  canonical({ ...q, texts: { ...q.texts, section_title: undefined } });

/** The questions a question depends on: in its condition, and the source of its answers. */
export function dependencies(q: Question): string[] {
  const out = new Set<string>();
  if (q.visible_if !== undefined)
    for (const m of JSON.stringify(q.visible_if).matchAll(/"var":"([^".]+)/g)) out.add(m[1]!);
  if ('choices_from' in q && typeof q.choices_from === 'string') out.add(q.choices_from);
  out.delete(q.id);
  return [...out];
}

/** A predicate: does a definition of the template hold for `content`? */
export function sameMeaning(content: TemplateContent, reference: readonly ReferenceVersion[]) {
  const byId = new Map(content.questions.map((q) => [q.id, q]));
  const roles = canonical([...content.leader_roles].sort());
  const memo = new Map<string, boolean>();
  const holds = (id: string, path: ReadonlySet<string>): boolean => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    const q = byId.get(id);
    // A cycle of conditions never holds (the schema forbids it; this only keeps the walk finite).
    if (!q || path.has(id)) return false;
    const own = reference.some((v) => {
      const s = v.questions.get(id);
      if (!s || s.part !== q.part || (q.part === 'leader' && v.roles !== roles)) return false;
      return q.frozen && s.frozen
        ? s.anchor_key === q.anchor_key && structureOf(s) === structureOf(q)
        : exactly(s) === exactly(q);
    });
    const next = new Set(path).add(id);
    const ok = own && dependencies(q).every((d) => holds(d, next));
    memo.set(id, ok);
    return ok;
  };
  return (def: MetricDefinition) =>
    def.questions.every((ref) => {
      const q = byId.get(ref.key.split('.')[0]!);
      return q !== undefined && q.part === ref.part && holds(q.id, new Set());
    });
}
