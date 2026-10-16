// Which template versions can run as a seminar live poll (3.4), and what a participant gets of the
// open question (3.6). The presenter opens and shows one question at a time, so every question must
// stand alone: one or several choices, in the common part, no free text (free text is never shown on
// the big screen), no conditions and no choices taken from another question. Anonymous: no initials.
import type { Question } from '@varde/schema/template/question';
import type { TemplateContent } from '@varde/schema/template/template';
import { languageContent } from '../rounds/runner-content.js';

export type LiveQuestion = Extract<Question, { type: 'single' | 'multi' }>;

const isLive = (q: Question): q is LiveQuestion => q.type === 'single' || q.type === 'multi';

/** Why a template version cannot be a live poll (admin text, nynorsk), or null. */
export function liveProblem(c: TemplateContent): string | null {
  if (c.audience !== 'seminar_live')
    return 'Skjemaet er ikkje laga for live-spørsmål. Vel eit skjema med målgruppa «Under seminar».';
  if (c.identification !== 'none')
    return 'Live-spørsmåla er anonyme. Vel eit skjema utan initialar.';
  for (const q of c.questions) {
    if (!isLive(q))
      return `Spørsmål ${q.id} har ikkje svaralternativ. På storskjermen kan vi berre vise spørsmål med eitt eller fleire val.`;
    if (q.part !== 'common')
      return `Spørsmål ${q.id} er for leiarar. Live-spørsmåla har ingen leiardel.`;
    if (q.free_text !== undefined)
      return `Spørsmål ${q.id} har fritekst. Fritekst blir aldri vist på storskjermen, så ta det bort.`;
    if (
      q.visible_if !== undefined ||
      q.choices_from !== undefined ||
      q.options.some((o) => o.visible_if !== undefined)
    )
      return `Spørsmål ${q.id} heng saman med eit anna spørsmål. Kvart live-spørsmål må stå åleine.`;
  }
  return null;
}

/** The questions of a valid live version, in order (liveProblem has passed). */
export function liveQuestions(c: TemplateContent): LiveQuestion[] {
  return c.questions.filter(isLive);
}

/** The open question as a participant gets it: texts and options in the version's languages. */
export function participantQuestion(
  q: LiveQuestion,
  languages: readonly string[],
  no: number,
  total: number,
) {
  return {
    no,
    total,
    question: languageContent(
      {
        id: q.id,
        part: q.part,
        type: q.type,
        texts: q.texts,
        options: q.options.map((o) => ({ id: o.id, texts: o.texts })),
        ...(q.type === 'multi' && q.max_choices !== undefined
          ? { max_choices: q.max_choices }
          : {}),
        ...(q.type === 'multi' && q.min_choices !== undefined
          ? { min_choices: q.min_choices }
          : {}),
        ...(q.exclusive_options === undefined ? {} : { exclusive_options: q.exclusive_options }),
      },
      languages,
    ),
  };
}
