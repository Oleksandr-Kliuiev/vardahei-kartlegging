// Every text a respondent can see, with a stable key, its place in the workshop's words and whether it
// must have Nynorsk words (2.16). The workshop's checklist and translation view and the survey list of
// the API read the same list. Types only: no zod at run time, so the admin can import it.
import type { TemplateContent } from './template.js';
import type { LocalizedText } from './texts.js';

export interface RespondentText {
  /** Stable across moves and renames: `intro.title`, `q.F5.text`, `q.F5.option.ja`, `tip.2.title` … */
  key: string;
  /** A question id, or the part of the survey: `intro`, `invitation`, `leader`, `end`. */
  owner: string;
  /** The place in the workshop's words: «F5: svar 2», «Velkomen: tittel». */
  where: string;
  text: LocalizedText;
  /** An empty Nynorsk text here is a gap the respondent would meet. */
  required: boolean;
}

/** In the order a respondent meets them: welcome, invitation, questions, leader part, advice. */
export function respondentTexts(c: TemplateContent): RespondentText[] {
  const out: RespondentText[] = [];
  const add = (
    key: string,
    owner: string,
    where: string,
    text: LocalizedText | undefined,
    required = true,
  ) => {
    if (text) out.push({ key, owner, where, text, required });
  };
  add('intro.title', 'intro', 'Velkomen: tittel', c.intro.title);
  add('intro.short', 'intro', 'Velkomen: overskrift', c.intro.short, false);
  c.intro.letter.forEach((t, i) =>
    add(`intro.letter.${i}`, 'intro', `Velkomen: avsnitt ${i + 1}`, t),
  );
  c.intro.facts.forEach((t, i) => add(`intro.facts.${i}`, 'intro', `Velkomen: punkt ${i + 1}`, t));
  add('intro.sender', 'intro', 'Velkomen: avsendar', c.intro.sender);
  add('intro.contact.hours', 'intro', 'Kontakt: opningstid', c.intro.contact.hours);
  if (c.invitation) {
    add('invitation.letter', 'invitation', 'Invitasjon: brevet', c.invitation.letter);
    add('invitation.poster.title', 'invitation', 'Plakat: tittel', c.invitation.poster.title);
    add('invitation.poster.text', 'invitation', 'Plakat: tekst', c.invitation.poster.text);
    add(
      'invitation.poster.footer',
      'invitation',
      'Plakat: botntekst',
      c.invitation.poster.footer,
      false,
    );
  }
  const question = (q: TemplateContent['questions'][number]) => {
    const k = `q.${q.id}`;
    add(`${k}.text`, q.id, `${q.id}: spørsmålet`, q.texts.text);
    add(`${k}.section`, q.id, `${q.id}: seksjonstittel`, q.texts.section_title);
    add(`${k}.help`, q.id, `${q.id}: hjelpetekst`, q.texts.help, false);
    add(`${k}.placeholder`, q.id, `${q.id}: plasshaldar`, q.texts.placeholder, false);
    add(`${k}.short`, q.id, `${q.id}: kortnamn`, q.texts.short_label, false);
    if (q.type === 'single' || q.type === 'multi') {
      q.options.forEach((o, i) =>
        add(`${k}.option.${o.id}`, q.id, `${q.id}: svar ${i + 1}`, o.texts.text),
      );
      add(
        `${k}.scenario.title`,
        q.id,
        `${q.id}: forklaring, tittel`,
        q.scenario?.explanation.title,
      );
      add(`${k}.scenario.text`, q.id, `${q.id}: forklaring`, q.scenario?.explanation.text);
    }
    if (q.type === 'scale')
      // One row needs no label (B14 in kartlegging); several do.
      q.rows.forEach((r, i) =>
        add(`${k}.row.${r.id}`, q.id, `${q.id}: rad ${i + 1}`, r.texts.text, q.rows.length > 1),
      );
    if (q.type === 'scale' || q.type === 'nps') {
      add(`${k}.low`, q.id, `${q.id}: lågaste på skalaen`, q.scale.low);
      add(`${k}.high`, q.id, `${q.id}: høgaste på skalaen`, q.scale.high);
    }
    if (q.type !== 'text') add(`${k}.free`, q.id, `${q.id}: fritekst`, q.free_text?.texts.text);
  };
  c.questions.filter((q) => q.part !== 'leader').forEach(question);
  // The leader part opens with its own words, needed only when it has questions.
  const leader = c.questions.filter((q) => q.part === 'leader');
  add('leader.title', 'leader', 'Leiardelen: tittel', c.leader_intro.title, leader.length > 0);
  add('leader.text', 'leader', 'Leiardelen: tekst', c.leader_intro.text, leader.length > 0);
  leader.forEach(question);
  c.tips.forEach((t, i) => {
    add(`tip.${i}.title`, 'end', `Råd ${i + 1}: tittel`, t.title);
    add(`tip.${i}.text`, 'end', `Råd ${i + 1}: tekst`, t.text);
  });
  return out;
}

/** Texts a respondent would meet empty: a question without words, an answer without a label … */
export const emptyTexts = (c: TemplateContent): RespondentText[] =>
  respondentTexts(c).filter((t) => t.required && !t.text.nn.trim());
