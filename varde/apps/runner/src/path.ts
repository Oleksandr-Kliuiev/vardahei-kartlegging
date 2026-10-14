import { prune, visibleQuestions, type Answers, type RunnerVersion } from '@varde/rules/runner';
import type { Question } from '@varde/schema/template/question';

export type Step = Question | 'B-intro';
export function steps(version: RunnerVersion, answers: Answers): Step[] {
  const questions = visibleQuestions(version, answers);
  const start = questions.findIndex((q) => q.part === 'leader');
  const out: Step[] = [...questions];
  if (start !== -1) out.splice(start, 0, 'B-intro');
  return out;
}
export function submissionAnswers(version: RunnerVersion, answers: Answers, free: Record<string, string>) {
  const clean = prune(version, answers);
  const ids = new Set(visibleQuestions(version, clean).map((q) => q.id));
  return { answers: clean, free: Object.fromEntries(Object.entries(free).filter(([id]) => ids.has(id))) };
}
