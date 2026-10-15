// What the trail shows for a path: one dot per visible question, a section per cairn, and how each dot looks.
import type { Answers } from '@varde/rules/runner';
import type { Question } from '@varde/schema/template/question';
import type { Mark } from './landscape/landscape.js';
import type { Step } from './path.js';

export const isQuestion = (s: Step | undefined): s is Question =>
  s !== undefined && s !== 'B-intro';

/** A new section starts at a section title and where the leader part begins. */
export function sectionsOf(questions: readonly Question[]): number[] {
  let s = 0;
  return questions.map((q, i) => {
    const prev = questions[i - 1];
    if (prev && (q.texts.section_title || q.part !== prev.part)) s++;
    return s;
  });
}

export interface TrailState {
  questions: Question[];
  sections: number[];
  marks: Mark[];
  /** Dot of the current question (or of the last one passed). */
  at: number;
  lastCommon: number;
  /** The respondent has chosen to answer the leader part. */
  leaderChosen: boolean;
  no: number;
  total: number;
  leaderCount: number;
}

/**
 * `step` is the draft step in `path` (-1 = intro, path.length = review); `done` after sending.
 * Leader questions stay optional (dashed) until the respondent takes them, and count as skipped if not taken.
 */
export function trailState(
  path: readonly Step[],
  step: number,
  answers: Answers,
  done: boolean,
  skipLeader: boolean,
): TrailState {
  const questions = path.filter(isQuestion);
  const bIntro = path.indexOf('B-intro');
  const leaderChosen = bIntro !== -1 && step > bIntro && !skipLeader;
  const current = path[step];
  const passedAll = done || step >= path.length;
  const at = isQuestion(current)
    ? questions.indexOf(current)
    : Math.max(0, path.slice(0, Math.max(0, step)).filter(isQuestion).length - 1);
  const common = questions.filter((q) => q.part !== 'leader');
  const marks = questions.map((q, i): Mark => {
    const leader = q.part === 'leader';
    if (leader && !leaderChosen) return skipLeader || (done && !leaderChosen) ? 'hoppa' : 'valfri';
    const passed = passedAll || current === 'B-intro' ? true : isQuestion(current) ? i < at : false;
    if (!passed) return 'att';
    return answers[q.id] === undefined ? 'hoppa' : 'svart';
  });
  return {
    questions,
    sections: sectionsOf(questions),
    marks,
    at,
    lastCommon: Math.max(0, common.length - 1),
    leaderChosen,
    no: at + 1,
    total: leaderChosen ? questions.length : common.length,
    leaderCount: questions.length - common.length,
  };
}
