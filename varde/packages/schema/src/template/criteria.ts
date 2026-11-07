// Criteria of a conversation guide (3.1, decision 07.11): per question three short texts that say when
// the answer is «Ivaretatt», «Forbetringspotensial» or «Manglar». «Samtalar» shows each under its rating
// button; only a guide (audience `interview`) has them. No zod here, so the admin can import it.
import type { Question } from './question.js';

/** The key of each criterion in the texts of a question, by the rating it belongs to. */
export const CRITERIA = {
  ivaretatt: 'criteria_ivaretatt',
  forbetring: 'criteria_forbetring',
  manglar: 'criteria_manglar',
} as const satisfies Record<string, keyof Question['texts']>;
export type CriterionRating = keyof typeof CRITERIA;
export type CriterionKey = (typeof CRITERIA)[CriterionRating];

/** The workshop's label of each criterion (Nynorsk, as the guide). */
export const CRITERION_LABEL: Record<CriterionRating, string> = {
  ivaretatt: 'Ivaretatt når …',
  forbetring: 'Forbetringspotensial når …',
  manglar: 'Manglar når …',
};

/** A criterion is a line or two under a button; what the one who asks needs more belongs in the hint. */
export const CRITERION_MAX_LENGTH = 200;

export const criterionEntries = () => Object.entries(CRITERIA) as [CriterionRating, CriterionKey][];
