// Shapes of the seminar admin API (3a) and small helpers of the seminar pages.
import type { MouseEvent } from 'react';

export type SeminarLang = 'nn' | 'en';
export interface SeminarCounts {
  total: number;
  companies: { company: string; n: number }[];
}
export interface Seminar {
  id: string;
  topic_nn: string;
  topic_en: string | null;
  date: string;
  start: string;
  end: string;
  when: string;
  starts_at: string;
  ends_at: string;
  place: string;
  format: 'onsite' | 'digital';
  languages: SeminarLang[];
  clients: { id: string; name: string }[];
  link: string | null;
  status: 'planned' | 'held';
  registrations: SeminarCounts;
}
export interface Material {
  id: string;
  title: string;
  url: string;
}
export interface SeminarDetail extends Seminar {
  findings: { id: string; status: string; rule_key: string }[];
  materials?: Material[];
}
export interface SeminarList {
  seminars: Seminar[];
  contacts_to_review: number;
}
export interface Participant {
  name: string;
  company: string;
  email: string;
  lang: string;
  registered_at: string;
}
export interface ContactReview {
  id: string;
  name: string;
  company: string;
  email: string;
  last_confirmed_at: string;
  registrations: number;
}
export interface SeminarDraft {
  topic_nn: string;
  topic_en: string;
  date: string;
  start: string;
  end: string;
  place: string;
  format: 'onsite' | 'digital';
  languages: SeminarLang[];
  clients: string[];
}

export const emptyDraft = (): SeminarDraft => ({
  topic_nn: '',
  topic_en: '',
  date: '',
  start: '09:00',
  end: '11:00',
  place: '',
  format: 'onsite',
  languages: ['nn'],
  clients: [],
});

export const draftOf = (s: Seminar): SeminarDraft => ({
  topic_nn: s.topic_nn,
  topic_en: s.topic_en ?? '',
  date: s.date,
  start: s.start,
  end: s.end,
  place: s.place,
  format: s.format,
  languages: s.languages,
  clients: s.clients.map((c) => c.id),
});

/** The body the API takes: no English topic unless English is on. */
export const bodyOf = (d: SeminarDraft) => ({
  ...d,
  topic_en: d.languages.includes('en') ? d.topic_en : undefined,
});

/** «Gasta og Daco», «Gasta, Daco og Kviknes». */
export function names(list: readonly string[]): string {
  if (list.length < 2) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} og ${list.at(-1)}`;
}

/** «Gasta 11 · Daco 7» */
export const perCompany = (c: SeminarCounts) => c.companies.map((x) => `${x.company} ${x.n}`).join(' · ');

export const registered = (n: number) => `${n} påmeld${n === 1 ? '' : 'e'}`;

const DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Oslo',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});
/** «16.10.2026», Oslo time, for lists and logs. */
export const shortDate = (iso: string) =>
  DATE.formatToParts(new Date(iso))
    .filter((p) => p.type !== 'literal')
    .map((p) => p.value)
    .join('.');

/** In-app navigation without a page load: the shell follows popstate (App.tsx). */
export function go(event: MouseEvent<HTMLAnchorElement> | null, href: string) {
  if (event) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
  }
  window.history.pushState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Copies to the clipboard and says so; without a clipboard it says how to copy by hand. */
export function copy(text: string, toast: (m: string) => void, done: string) {
  if (!navigator.clipboard) {
    toast('Kopier for hand: merk teksten og bruk Ctrl+C.');
    return;
  }
  void navigator.clipboard
    .writeText(text)
    .then(() => toast(done))
    .catch(() => toast('Kopier for hand: merk teksten og bruk Ctrl+C.'));
}
