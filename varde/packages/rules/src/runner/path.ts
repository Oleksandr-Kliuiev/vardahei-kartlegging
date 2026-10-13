// Display path (1.6, ADR-006: the server recomputes it): questions in order, `visible_if`
// evaluated against the answers of questions already shown (a question not shown counts as
// no answer), the leader part only for leaders (`leader_roles` on the role question).
import type { Question } from '@varde/schema/template/question';
import { optionsFor } from './choices.js';
import { evaluate } from './expression.js';
import type { Answers, RunnerVersion } from './types.js';

export function isLeader(version: RunnerVersion, answers: Answers): boolean {
  const role = version.questions.find((q) => q.role);
  const value = role === undefined ? undefined : answers[role.id];
  return typeof value === 'string' && version.leader_roles.includes(value);
}

function keepShownOptions(
  q: Question,
  value: Answers[string],
  shown: Answers,
): Answers[string] | undefined {
  if (q.type !== 'single' && q.type !== 'multi') return value;
  const allowed = new Set(optionsFor(q, shown).map((o) => o.id));
  if (Array.isArray(value)) {
    const kept = value.filter((v) => allowed.has(v));
    return kept.length > 0 ? kept : undefined;
  }
  return typeof value === 'string' && allowed.has(value) ? value : undefined;
}

function walk(version: RunnerVersion, answers: Answers): { visible: Question[]; pruned: Answers } {
  const pruned: Answers = {};
  const visible: Question[] = [];
  for (const q of version.questions) {
    if (q.part === 'leader' && !isLeader(version, pruned)) continue;
    if (q.visible_if !== undefined && !evaluate(q.visible_if, pruned)) continue;
    visible.push(q);
    const value = answers[q.id];
    if (value === undefined) continue;
    const kept = keepShownOptions(q, value, pruned);
    if (kept !== undefined) pruned[q.id] = kept;
  }
  return { visible, pruned };
}

export function visibleQuestions(version: RunnerVersion, answers: Answers): Question[] {
  return walk(version, answers).visible;
}

/** Drops answers to questions and options that were not shown. */
export function prune(version: RunnerVersion, answers: Answers): Answers {
  return walk(version, answers).pruned;
}
