// How a new survey starts (2.16, decisions 5 and 6 of 17.10). The draft gets the structure questions
// (initials, role), the contact and sender of «Innstillingar», plain words where a respondent meets the
// survey first and one empty question of its own: it saves and shows in the phone at once, and only
// that question is left to write. Sentences come from the approved seeded surveys where they fit; the
// few new ones are listed in docs/varde/evidence/stage-2/2c-evidence.md for review.
import type { TemplateContent } from '@varde/schema/template/template';
import { initialsQuestion, roleQuestion } from '@varde/schema/template/structure';

type Audience = TemplateContent['audience'];
type Lang = TemplateContent['required_languages'][number];
type Words = { nn: string; en: string };

export interface Starter {
  title: string;
  audience: Audience;
  identification: 'initials' | 'none';
  required_languages: Lang[];
  contact: TemplateContent['intro']['contact'];
  sender: TemplateContent['intro']['sender'];
}

const MINUTES: Record<Audience, number> = { client_survey: 5, seminar_live: 2, seminar_after: 3 };

/** A key for a title: lower case letters and digits joined by dashes (æ, ø, å spelled out). */
export function keyOf(title: string): string {
  const key = title
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return key || 'skjema';
}

export function starterContent(s: Starter): TemplateContent {
  const langs = s.required_languages;
  // Approved English where it exists; a text without it is left empty for «Omsetjing».
  const say = (w: Words | string) => {
    const nn = typeof w === 'string' ? w : w.nn,
      en = typeof w === 'string' ? '' : w.en;
    return {
      nn,
      ...(langs.includes('en') ? { en } : {}),
      ...(langs.includes('nb') ? { nb: '' } : {}),
    };
  };
  // Every chosen language has its key, so an empty one is a translation still to write, not an error.
  const fit = (t: { nn: string; en?: string | undefined; nb?: string | undefined }) => ({
    nn: t.nn,
    ...(langs.includes('en') ? { en: t.en ?? '' } : {}),
    ...(langs.includes('nb') ? { nb: t.nb ?? '' } : {}),
  });
  const initials = s.identification === 'initials';
  const own = initials ? [initialsQuestion('Q1', langs)] : [];
  const role = roleQuestion(`Q${own.length + 1}`, langs);
  const first = { ...(own[0] ?? role) };
  first.texts = { ...first.texts, section_title: say({ nn: 'Om deg', en: 'About you' }) };
  const n = own.length + 2;
  const empty = (text = '') => ({ texts: { text: say(text) } });
  const question = {
    id: `Q${n}`,
    type: 'single' as const,
    part: 'common' as const,
    texts: { ...empty().texts, section_title: say({ nn: 'Spørsmål', en: 'Questions' }) },
    options: [
      { id: 'a1', ...empty() },
      { id: 'a2', ...empty() },
    ],
  };
  const questions = [first, ...(initials ? [role] : []), question] as TemplateContent['questions'];
  const content: TemplateContent = {
    key: '',
    audience: s.audience,
    identification: s.identification,
    required_languages: langs,
    leader_roles: [],
    max_tips: 0,
    tips: [],
    questions,
    intro: {
      title: say(s.title),
      short: say(''),
      minutes: MINUTES[s.audience],
      letter: [],
      sender: fit(s.sender),
      facts: [],
      contact: { ...s.contact, hours: fit(s.contact.hours) },
    },
    leader_intro: {
      title: say({
        nn: 'Nokre spørsmål til deg som leiar',
        en: 'A few questions for you as a manager',
      }),
      text: say({
        nn: 'Sidan du har ansvar i bedrifta, har vi nokre spørsmål til.',
        en: 'Since you have responsibility in the company, we have a few more questions.',
      }),
    },
  };
  if (s.audience !== 'client_survey') return content;
  // A survey of the clients is sent out by a leader there: the letter and the poster.
  const names = initials
    ? {
        nn: 'Du skriv inn initialane dine først, elles er det ingen namn. Svara per person ser berre Vardahei IT, og bedrifta får eit samla bilete.',
        en: 'You enter your initials first; apart from that there are no names. Only Vardahei IT sees answers per person, and the company gets an overall picture.',
      }
    : {
        nn: 'Ingen namn følgjer med svara, og bedrifta får eit samla bilete.',
        en: 'No names come with the answers, and the company gets an overall picture.',
      };
  content.invitation = {
    letter: say({
      nn: `Hei alle!\n\nVardahei IT, som hjelper oss med IT, har laga ei kort undersøking. ${names.nn} Det tek om lag {minutt} minutt.\n\n{lenkje}\n\nLenkja går til {host}, så du kan trygt opne ho.{frist}\n\nTakk!`,
      en: `Hi everyone,\n\nVardahei IT, who help us with IT, has made a short survey. ${names.en} It takes about {minutt} minutes.\n\n{lenkje}\n\nThe link goes to {host}, so it's safe to open.{frist}\n\nThanks!`,
    }),
    poster: {
      title: say(s.title),
      text: say({
        nn: 'Ei kort undersøking frå Vardahei IT. Om lag {minutt} minutt.',
        en: 'A {minutt}-minute survey from Vardahei IT.',
      }),
      footer: say(
        initials
          ? {
              nn: 'Skriv inn initialane dine først. Svara per person ser berre Vardahei IT. Bedrifta får eit samla bilete utan initialar.',
              en: 'Enter your initials first. Only Vardahei IT sees the answers per person. Your company gets an overall picture without initials.',
            }
          : {
              nn: 'Ingen namn følgjer med svara. Bedrifta får eit samla bilete.',
              en: 'No names come with the answers. Your company gets an overall picture.',
            },
      ),
    },
  };
  return content;
}
