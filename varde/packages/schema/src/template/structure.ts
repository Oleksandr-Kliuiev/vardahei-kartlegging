// The questions a survey's structure needs (decision 5, 17.10): every survey has one role question, and
// a survey with identification «initials» one initials question. New surveys get them from the start,
// and the workshop adds or removes the initials question when identification changes. Texts are the
// approved ones of the seeded surveys (nn and en); other languages are written in the workshop.
import type { Question } from './question.js';

/** Longest initials answer (a single line). */
export const IDENTIFIER_MAX_LENGTH = 8;

type Langs = readonly string[];
const text = (langs: Langs, nn: string, en: string) => ({
  nn,
  ...(langs.includes('en') ? { en } : {}),
});

/** The role question: its answer decides who gets the leader part. */
export function roleQuestion(id: string, langs: Langs): Question {
  const option = (oid: string, nn: string, en: string) => ({
    id: oid,
    texts: { text: text(langs, nn, en) },
  });
  return {
    id,
    type: 'single',
    part: 'common',
    role: true,
    required: true,
    texts: { text: text(langs, 'Kva rolle har du i bedrifta?', 'What is your role at work?') },
    options: [
      option('leiar', 'Leiar', 'Manager'),
      option('kontor', 'Administrasjon/kontor', 'Administration/office'),
      option('prod', 'Produksjon/drift', 'Production/operations'),
      option('sal', 'Sal / Kundeservice', 'Sales / customer service'),
      option('it', 'IT / superbrukar', 'IT / super user'),
      option('anna', 'Anna', 'Other'),
    ],
  };
}

/** The initials question: one line of at most eight letters, first in the survey. */
export function initialsQuestion(id: string, langs: Langs): Question {
  return {
    id,
    type: 'text',
    part: 'common',
    identifier: true,
    required: true,
    single_line: true,
    uppercase: true,
    max_length: IDENTIFIER_MAX_LENGTH,
    texts: {
      text: text(
        langs,
        'Skriv inn initialane dine: 2 første og 3 siste. Eksempel: Ola Nordman = OLNOR',
        'Enter your initials: first 2 and last 3 letters. Example: Ola Nordman = OLNOR',
      ),
      help: text(
        langs,
        'Initialane gjer at vi kan sjå svara per tilsett og samanlikne med neste runde. Svara per person ser berre Vardahei IT.',
        'Your initials let us see answers per employee and compare with the next round. Only Vardahei IT sees answers per person.',
      ),
      placeholder: text(langs, 'OLNOR', 'OLNOR'),
    },
  };
}
