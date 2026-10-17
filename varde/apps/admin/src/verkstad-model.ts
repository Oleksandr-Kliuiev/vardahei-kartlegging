// The survey workshop's view of a template version (2.15): sections on the trail, moving and adding
// questions, frozen questions and where a schema issue belongs. Pure functions over the schema's own
// content; the workshop never stores anything the schema does not have.
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import type { Question } from '../../../packages/schema/src/template/question.js';
import { initialsQuestion } from '../../../packages/schema/src/template/structure.js';
import { respondentTexts } from '../../../packages/schema/src/template/respondent-texts.js';

/** JSON with sorted keys and no undefined values, so equal content compares equal. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export type Lang = 'nn' | 'en' | 'nb';
export type Text = { nn: string; en?: string | undefined; nb?: string | undefined };
export type QuestionType = Question['type'];

/** Selection keys: a question id, or a node of the trail. Question ids never start with «:». */
export const NODE = {
  settings: ':om',
  intro: ':velkomen',
  invitation: ':invitasjon',
  leader: ':leiar',
  end: ':slutt',
} as const;
export const sectionKey = (n: number) => `:seksjon:${n}`;
/** The trail node of a respondent text's owner (2.16): a question, or a part of the survey. */
export const nodeOfOwner = (owner: string): string =>
  owner === 'intro'
    ? NODE.intro
    : owner === 'invitation'
      ? NODE.invitation
      : owner === 'leader'
        ? NODE.leader
        : owner === 'end'
          ? NODE.end
          : owner;
export const sectionOfKey = (key: string) =>
  key.startsWith(':seksjon:') ? Number(key.slice(9)) : null;

export interface Section {
  title: Text | undefined;
  questions: Question[];
}

/** Common questions in sections: a section starts at the first question and at every section title. */
export function sectionsOf(c: TemplateContent): Section[] {
  const out: Section[] = [];
  for (const q of c.questions) {
    if (q.part === 'leader') continue;
    if (!out.length || q.texts.section_title)
      out.push({ title: q.texts.section_title, questions: [] });
    out[out.length - 1]!.questions.push(q);
  }
  return out;
}
export const leaderOf = (c: TemplateContent) => c.questions.filter((q) => q.part === 'leader');
/** The order a respondent meets the questions in: common part, then the leader part. */
export const ordered = (c: TemplateContent) => [
  ...c.questions.filter((q) => q.part !== 'leader'),
  ...leaderOf(c),
];

/** Content from sections: a section's title sits on its first question; empty sections disappear. */
export function withSections(
  c: TemplateContent,
  sections: Section[],
  leader = leaderOf(c),
): TemplateContent {
  const common = sections.flatMap((s) =>
    s.questions.map((q, i) => {
      const texts = { ...q.texts };
      if (i === 0 && s.title) texts.section_title = s.title;
      else delete texts.section_title;
      return { ...q, texts };
    }),
  );
  return { ...c, questions: [...common, ...leader] };
}

export interface Place {
  /** Section index, or `leader` for the leader part. */
  in: number | 'leader';
  /** Insert before this question; at the end when absent. */
  before?: string;
}

const insertAt = (list: Question[], q: Question, before?: string) => {
  const i = before ? list.findIndex((x) => x.id === before) : -1;
  return i < 0 ? [...list, q] : [...list.slice(0, i), q, ...list.slice(i)];
};
const stripTitle = (q: Question): Question => {
  const texts = { ...q.texts };
  delete texts.section_title;
  return { ...q, texts };
};

/** Removes a question; the section keeps its title on the next question, or goes when empty. */
export function removeQuestion(c: TemplateContent, id: string): TemplateContent {
  const sections = sectionsOf(c).map((s) => ({
    ...s,
    questions: s.questions.filter((q) => q.id !== id),
  }));
  return withSections(
    c,
    sections.filter((s) => s.questions.length),
    leaderOf(c).filter((q) => q.id !== id),
  );
}

/**
 * Identification decides whether the survey asks for initials (decision 5): «Med initialar» puts the
 * initials question first, «Anonym» removes it. A frozen initials question stays; the workshop does not
 * offer the switch then.
 */
export function setIdentification(c: TemplateContent, value: 'initials' | 'none'): TemplateContent {
  if (value === c.identification) return c;
  const next = { ...c, identification: value };
  if (value === 'none')
    return next.questions
      .filter((q) => q.identifier && !q.frozen)
      .reduce((acc, q) => removeQuestion(acc, q.id), next);
  if (next.questions.some((q) => q.identifier)) return next;
  const first = sectionsOf(next)[0]?.questions[0];
  return insertQuestion(next, initialsQuestion(nextId(next), next.required_languages), {
    in: 0,
    ...(first ? { before: first.id } : {}),
  });
}

/** Puts a deleted question back where it was in `before`, also after other changes since («Angre»). */
export function restoreQuestion(
  c: TemplateContent,
  before: TemplateContent,
  id: string,
): TemplateContent {
  const q = before.questions.find((x) => x.id === id);
  if (!q || c.questions.some((x) => x.id === id)) return c;
  const kept = (x: Question) => x.id !== id && c.questions.some((y) => y.id === x.id);
  if (q.part === 'leader') {
    const list = leaderOf(before);
    const next = list.slice(list.indexOf(q) + 1).find(kept);
    return insertQuestion(c, q, { in: 'leader', ...(next ? { before: next.id } : {}) });
  }
  const old = sectionsOf(before);
  const s = old.findIndex((x) => x.questions.includes(q));
  const sections = sectionsOf(c);
  const where = (x: Question) => sections.findIndex((n) => n.questions.some((y) => y.id === x.id));
  const mates = old[s]!.questions;
  const mate = mates.find(kept);
  if (mate) {
    const next = mates.slice(mates.indexOf(q) + 1).find(kept);
    return insertQuestion(c, q, { in: where(mate), ...(next ? { before: next.id } : {}) });
  }
  // It was alone in its section: the section comes back after the nearest earlier one that is left.
  const prev = old
    .slice(0, s)
    .flatMap((x) => x.questions)
    .reverse()
    .find(kept);
  const at = prev ? where(prev) + 1 : 0;
  sections.splice(at, 0, { title: q.texts.section_title, questions: [{ ...q, part: 'common' }] });
  return withSections(c, sections);
}

/** Puts a new question `q` at `place`; a section index past the end starts a new untitled section. */
export function insertQuestion(c: TemplateContent, q: Question, place: Place): TemplateContent {
  const sections = sectionsOf(c);
  if (place.in === 'leader')
    return withSections(
      c,
      sections,
      insertAt(leaderOf(c), { ...stripTitle(q), part: 'leader' }, place.before),
    );
  const fresh = { ...stripTitle(q), part: 'common' } as Question;
  const target = sections[place.in];
  if (!target) return withSections(c, [...sections, { title: undefined, questions: [fresh] }]);
  sections[place.in] = { ...target, questions: insertAt(target.questions, fresh, place.before) };
  return withSections(c, sections);
}

/**
 * Moves a question to `place` (section indices as before the move). Frozen, role and initials questions
 * stay in the common part. A section that loses its last question goes; its title goes with it.
 */
export function moveQuestion(c: TemplateContent, id: string, place: Place): TemplateContent {
  const q = c.questions.find((x) => x.id === id);
  if (!q || place.before === id) return c;
  if (place.in === 'leader' && (q.frozen || q.role || q.identifier)) return c;
  const moved = stripTitle(q);
  const sections = sectionsOf(c).map((s) => ({
    ...s,
    questions: s.questions.filter((x) => x.id !== id),
  }));
  let leader = leaderOf(c).filter((x) => x.id !== id);
  if (place.in === 'leader') leader = insertAt(leader, { ...moved, part: 'leader' }, place.before);
  else {
    const target = sections[place.in];
    if (!target) return c;
    target.questions = insertAt(target.questions, { ...moved, part: 'common' }, place.before);
  }
  return withSections(
    c,
    sections.filter((s) => s.questions.length),
    leader,
  );
}

/** One step up or down in the order the respondent sees; crosses section borders. */
export function moveBy(c: TemplateContent, id: string, dir: -1 | 1): TemplateContent {
  const q = c.questions.find((x) => x.id === id);
  if (!q) return c;
  if (q.part === 'leader') {
    const list = leaderOf(c);
    const i = list.indexOf(q);
    if (!list[i + dir]) return c;
    const after = list[i + 2];
    return moveQuestion(
      c,
      id,
      dir < 0
        ? { in: 'leader', before: list[i - 1]!.id }
        : after
          ? { in: 'leader', before: after.id }
          : { in: 'leader' },
    );
  }
  const sections = sectionsOf(c);
  const s = sections.findIndex((x) => x.questions.includes(q));
  const list = sections[s]!.questions;
  const i = list.indexOf(q);
  if (dir < 0) {
    if (i > 0) return moveQuestion(c, id, { in: s, before: list[i - 1]!.id });
    // The first question of a section goes to the end of the previous section.
    return s === 0 ? c : moveQuestion(c, id, { in: s - 1 });
  }
  if (i < list.length - 1) {
    const after = list[i + 2];
    return moveQuestion(c, id, after ? { in: s, before: after.id } : { in: s });
  }
  // The last question of a section starts the next one, and carries that section's title.
  const next = sections[s + 1];
  return next ? moveQuestion(c, id, { in: s + 1, before: next.questions[0]!.id }) : c;
}

export function moveSection(c: TemplateContent, index: number, dir: -1 | 1): TemplateContent {
  const sections = sectionsOf(c);
  const j = index + dir;
  if (j < 0 || j >= sections.length) return c;
  [sections[index], sections[j]] = [sections[j]!, sections[index]!];
  return withSections(c, sections);
}

export function setSectionTitle(
  c: TemplateContent,
  index: number,
  lang: Lang,
  value: string,
): TemplateContent {
  const sections = sectionsOf(c);
  const s = sections[index];
  if (!s) return c;
  sections[index] = { ...s, title: { ...(s.title ?? { nn: '' }), [lang]: value } };
  return withSections(c, sections);
}

/** A new section after `index` with one empty question in it. */
export function addSection(
  c: TemplateContent,
  index: number,
  title: Text,
  q: Question,
): TemplateContent {
  const sections = sectionsOf(c);
  sections.splice(index + 1, 0, { title, questions: [{ ...q, part: 'common' }] });
  return withSections(c, sections);
}

/**
 * The id of a new question: after the highest one in this draft and in `used` (the published base and
 * every id seen during the visit), so a deleted question's id never comes back for a different question
 * and its answers or conditions are never mixed up with the new one.
 */
export function nextId(c: TemplateContent, used: Iterable<string> = [], prefix = 'Q'): string {
  const own = new RegExp(`^${prefix}(\\d+)$`);
  let n = c.questions.length;
  for (const id of [...c.questions.map((q) => q.id), ...used]) {
    const m = own.exec(id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${prefix}${n + 1}`;
}

export const localized = (languages: readonly string[], value = ''): Text =>
  Object.fromEntries(languages.map((l) => [l, value])) as Text;

export function newQuestion(
  type: QuestionType,
  id: string,
  languages: readonly string[],
): Question {
  const base = { id, part: 'common' as const, texts: { text: localized(languages) } };
  if (type === 'single' || type === 'multi')
    return {
      ...base,
      type,
      options: [
        { id: 'a1', texts: { text: localized(languages) } },
        { id: 'a2', texts: { text: localized(languages) } },
      ],
    };
  if (type === 'text') return { ...base, type, single_line: true, max_length: 200 };
  const ends = { low: localized(languages), high: localized(languages) };
  return type === 'nps'
    ? { ...base, type, scale: { min: 0, max: 10, ...ends } }
    : {
        ...base,
        type,
        scale: { min: 1, max: 5, ...ends },
        rows: [{ id: 'r1', texts: { text: localized(languages) } }],
      };
}

/** Another type for the same question: texts, part, required and condition stay; answers stay between single and multi. */
export function changeType(
  q: Question,
  type: QuestionType,
  languages: readonly string[],
): Question {
  if (q.type === type) return q;
  const fresh = newQuestion(type, q.id, languages);
  const keep = {
    part: q.part,
    texts: q.texts,
    ...(q.required ? { required: true as const } : {}),
    ...(q.visible_if !== undefined ? { visible_if: q.visible_if } : {}),
  };
  if ((type === 'single' || type === 'multi') && (q.type === 'single' || q.type === 'multi'))
    return { ...fresh, ...keep, options: q.options } as Question;
  return { ...fresh, ...keep };
}

/** Answer and row ids stay stable: a new one is the first free `aN` (rows: `rN`). */
export function nextOptionId(ids: readonly string[], prefix = 'a'): string {
  let n = ids.length + 1;
  while (ids.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/* ---------- frozen questions (ADR-005) ---------- */

/** A question as wording and answers, apart from its anchor and the section it opens (key order aside). */
export const withoutAnchor = (q: Question) =>
  canonical({ ...q, anchor_key: undefined, texts: { ...q.texts, section_title: undefined } });

export interface FrozenChange {
  id: string;
  before: Question;
  now: Question;
  /** A new anchor means a new meaning; otherwise the workshop asks. */
  semantic: boolean;
}
/** Frozen questions of the published base that this draft changed (moving them is no change). */
export function frozenChanges(base: TemplateContent | null, c: TemplateContent): FrozenChange[] {
  if (!base) return [];
  const out: FrozenChange[] = [];
  for (const before of base.questions.filter((q) => q.frozen)) {
    const now = c.questions.find((q) => q.id === before.id);
    if (!now) continue;
    if (withoutAnchor(now) === withoutAnchor(before) && now.anchor_key === before.anchor_key)
      continue;
    out.push({ id: before.id, before, now, semantic: now.anchor_key !== before.anchor_key });
  }
  return out;
}
/** Marks a changed frozen question: spelling keeps the anchor, a new meaning gets a new one. */
export function markFrozen(
  c: TemplateContent,
  base: TemplateContent,
  id: string,
  kind: 'orthographic' | 'semantic',
  versionNo: number,
): TemplateContent {
  const before = base.questions.find((q) => q.id === id);
  if (!before?.anchor_key) return c;
  const anchor = kind === 'semantic' ? `${before.anchor_key}~v${versionNo}` : before.anchor_key;
  return {
    ...c,
    questions: c.questions.map((q) => (q.id === id ? { ...q, anchor_key: anchor } : q)),
  };
}
/** Back to the wording of the published version (the place in the order stays). */
export function revertFrozen(
  c: TemplateContent,
  base: TemplateContent,
  id: string,
): TemplateContent {
  const before = base.questions.find((q) => q.id === id);
  if (!before) return c;
  return {
    ...c,
    questions: c.questions.map((q) => {
      if (q.id !== id) return q;
      const texts = { ...before.texts };
      if (q.texts.section_title) texts.section_title = q.texts.section_title;
      else delete texts.section_title;
      return { ...before, texts };
    }),
  };
}

/* ---------- texts and languages ---------- */

export interface TextRef {
  node: string;
  where: string;
  text: Text;
}
/** Every text a respondent can see, with the trail node it belongs to (one list with the API, 2.16). */
export function textsOf(c: TemplateContent): TextRef[] {
  return respondentTexts(c).map((t) => ({
    node: nodeOfOwner(t.owner),
    where: t.where,
    text: t.text,
  }));
}
/** Texts that have Nynorsk but not `lang` yet (an empty row label is allowed, B14). */
export function missingIn(c: TemplateContent, lang: Lang): TextRef[] {
  if (lang === 'nn') return [];
  return textsOf(c).filter((t) => t.text.nn.trim() && !(t.text[lang] ?? '').trim());
}

/* ---------- where an issue belongs ---------- */

const FIELD: Record<string, string> = {
  'intro.title': 'Tittel',
  'intro.short': 'Overskrift over tittelen',
  'intro.sender': 'Avsendar under brevet',
  'intro.minutes': 'Minutt',
  'intro.contact.name': 'Kontakt: namn',
  'intro.contact.phone': 'Kontakt: telefon',
  'intro.contact.email': 'Kontakt: e-post',
  'intro.contact.hours': 'Kontakt: opningstid',
  'leader_intro.title': 'Leiardelen: tittel',
  'leader_intro.text': 'Leiardelen: tekst',
  'invitation.letter': 'Invitasjon: brevet',
  'invitation.poster.title': 'Plakat: tittel',
  'invitation.poster.text': 'Plakat: tekst',
  'invitation.poster.footer': 'Plakat: botntekst',
  leader_roles: 'Leiarroller',
  max_tips: 'Tal på råd',
  questions: 'Spørsmåla',
};
const PART: Record<string, string> = {
  'texts.text': 'spørsmålet',
  'texts.help': 'hjelpeteksten',
  'texts.section_title': 'seksjonstittelen',
  'texts.placeholder': 'plasshaldaren',
  'texts.short_label': 'kortnamnet',
  'scale.low': 'lågaste på skalaen',
  'scale.high': 'høgaste på skalaen',
  free_text: 'fritekst',
  visible_if: 'vilkåret',
  choices_from: 'svar frå anna spørsmål',
};
/** Where an issue is, in the workshop's words («F5: svar 2», «Kontakt: e-post»), never a schema path. */
export function whereOf(c: TemplateContent, path: readonly (string | number)[]): string {
  const p = path.filter((x) => x !== 'nn' && x !== 'en' && x !== 'nb');
  if (p[0] === 'questions' && typeof p[1] === 'number') {
    const id = c.questions[p[1]]?.id ?? `Spørsmål ${p[1] + 1}`;
    const [a, b] = p.slice(2);
    if ((a === 'options' || a === 'rows') && typeof b === 'number')
      return `${id}: ${a === 'options' ? 'svar' : 'rad'} ${b + 1}`;
    const part = PART[`${a}.${b}`] ?? PART[String(a)];
    return part ? `${id}: ${part}` : id;
  }
  if (p[0] === 'intro' && (p[1] === 'letter' || p[1] === 'facts') && typeof p[2] === 'number')
    return `${p[1] === 'letter' ? 'Avsnitt' : 'Punkt'} ${p[2] + 1}`;
  if (p[0] === 'tips' && typeof p[1] === 'number') return `Råd ${p[1] + 1}`;
  for (let n = p.length; n > 0; n--) {
    const field = FIELD[p.slice(0, n).join('.')];
    if (field) return field;
  }
  return 'Skjemaet';
}

export function issueNode(c: TemplateContent, path: readonly (string | number)[]): string {
  const [head, n] = path;
  if (head === 'questions' && typeof n === 'number') return c.questions[n]?.id ?? NODE.settings;
  if (head === 'intro') return NODE.intro;
  if (head === 'invitation') return NODE.invitation;
  if (head === 'leader_intro' || head === 'leader_roles') return NODE.leader;
  if (head === 'tips' || head === 'max_tips') return NODE.end;
  return NODE.settings;
}
