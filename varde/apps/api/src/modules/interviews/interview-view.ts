// What «Samtalar» shows of a guide and of a conversation (2.20): the questions of the guide, the counts
// of the rating scale and the score. Pure functions, shared by the service and the tests.
import { criterionEntries, type CriterionRating } from '@varde/schema/template/criteria';
import type { Rating } from './interview-input.js';

/** When a question is Ivaretatt, Forbetringspotensial or Manglar (3.1); null where the guide says nothing. */
export type Criteria = Record<CriterionRating, string | null>;

export interface GuideQuestion {
  id: string;
  /** The theme the question belongs to: the last section title at or before it. */
  section: string;
  short: string;
  text: string;
  help: string | null;
  /** Null when the guide has no criterion for the question. */
  criteria: Criteria | null;
}

interface ContentQuestion {
  id: string;
  texts: {
    text: { nn: string };
    short_label?: { nn: string };
    section_title?: { nn: string };
    help?: { nn: string };
    criteria_ivaretatt?: { nn: string };
    criteria_forbetring?: { nn: string };
    criteria_manglar?: { nn: string };
  };
}

function criteriaOf(texts: ContentQuestion['texts']): Criteria | null {
  const c = Object.fromEntries(
    criterionEntries().map(([rating, key]) => [rating, texts[key]?.nn.trim() || null]),
  ) as Criteria;
  return c.ivaretatt || c.forbetring || c.manglar ? c : null;
}

/** The questions of a published guide, in order, with the theme each belongs to. */
export function guideQuestions(content: unknown): GuideQuestion[] {
  const questions = ((content as { questions?: ContentQuestion[] } | null)?.questions ?? []).filter(
    (q) => typeof q?.id === 'string' && typeof q.texts?.text?.nn === 'string',
  );
  let section = '';
  return questions.map((q) => {
    const title = q.texts.section_title?.nn.trim();
    if (title) section = title;
    const text = q.texts.text.nn;
    return {
      id: q.id,
      section,
      short: q.texts.short_label?.nn.trim() || text.slice(0, 48),
      text,
      help: q.texts.help?.nn.trim() || null,
      criteria: criteriaOf(q.texts),
    };
  });
}

export const guideTitle = (content: unknown): string => {
  const title = (content as { intro?: { title?: { nn?: unknown } } } | null)?.intro?.title?.nn;
  return typeof title === 'string' && title.trim() ? title.trim() : 'Samtaleguide';
};

export interface Counts {
  ivaretatt: number;
  forbetring: number;
  manglar: number;
  ikkje_aktuelt: number;
  /** Questions of the guide without a rating yet. */
  none: number;
}

/** How the questions of the guide were rated; answers to questions the guide no longer has are left out. */
export function countRatings(
  questions: readonly { id: string }[],
  answers: readonly { question_id: string; rating: string | null }[],
): Counts {
  const byId = new Map(answers.map((a) => [a.question_id, a.rating as Rating | null]));
  const counts: Counts = { ivaretatt: 0, forbetring: 0, manglar: 0, ikkje_aktuelt: 0, none: 0 };
  for (const q of questions) {
    const r = byId.get(q.id);
    if (r) counts[r] += 1;
    else counts.none += 1;
  }
  return counts;
}

/** Ivaretatt 2, Forbetringspotensial 1, Manglar 0; «Ikkje aktuelt» and unrated questions do not count.
 * Null until something is rated. */
export function score(c: Counts): number | null {
  const n = c.ivaretatt + c.forbetring + c.manglar;
  return n === 0 ? null : Math.round(((2 * c.ivaretatt + c.forbetring) / (2 * n)) * 100);
}
