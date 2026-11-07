// «Samtalar» (2.20): the shapes the API gives, the rating scale and small helpers shared by the pages.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { longDate as dayInYear } from './overview.js';

export type Rating = 'ivaretatt' | 'forbetring' | 'manglar' | 'ikkje_aktuelt';
export type Status = 'planned' | 'in_progress' | 'done';

/** The scale of decision 2 of 06.11: always a word and a glyph beside the colour. */
export const RATING: Record<Rating, { word: string; glyph: string; key: string; cls: string }> = {
  ivaretatt: { word: 'Ivaretatt', glyph: '✓', key: '1', cls: 'iv' },
  forbetring: { word: 'Forbetringspotensial', glyph: '!', key: '2', cls: 'fb' },
  manglar: { word: 'Manglar', glyph: '✕', key: '3', cls: 'mg' },
  ikkje_aktuelt: { word: 'Ikkje aktuelt', glyph: '·', key: '0', cls: 'na' },
};
export const SCALE: readonly Rating[] = ['ivaretatt', 'forbetring', 'manglar'];

export interface Counts {
  ivaretatt: number;
  forbetring: number;
  manglar: number;
  ikkje_aktuelt: number;
  none: number;
}
export interface Person {
  role: string;
  name?: string;
}
export interface Guide {
  id: string;
  label: string;
  version_no: number;
  published_at: string | null;
  title: string;
  question_count: number;
}
export interface RoundSummary {
  id: string;
  name: string;
  status: string;
  created_at: string;
  guide: { id: string; label: string; title: string };
  counts: { planned: number; in_progress: number; done: number; total: number };
}
export interface InterviewRow {
  id: string;
  client: { id: string; name: string };
  status: Status;
  held_on: string | null;
  interviewees: Person[];
  /** Who from Vardahei was there; the start dialog offers these names to tick. */
  interviewers: string[];
  done_at: string | null;
  updated_at: string;
  counts: Counts;
  score: number | null;
}
export interface RoundView {
  id: string;
  name: string;
  status: string;
  guide: { id: string; label: string; title: string; question_count: number };
  interviews: InterviewRow[];
}
/** When a question is Ivaretatt, Forbetringspotensial or Manglar (3.1); null where the guide is silent. */
export type Criteria = Record<'ivaretatt' | 'forbetring' | 'manglar', string | null>;
export interface GuideQuestion {
  id: string;
  section: string;
  short: string;
  text: string;
  help: string | null;
  criteria: Criteria | null;
}
export interface AnswerRow {
  answer: string;
  rating: Rating | null;
  action: string;
  note: string;
  updated_at: string;
  updated_by: string;
}
export interface Interview {
  id: string;
  status: Status;
  held_on: string | null;
  interviewees: Person[];
  interviewers: string[];
  summary: string;
  agreed: string;
  note: string;
  started_at: string | null;
  done_at: string | null;
  done_by: string | null;
  client: { id: string; name: string };
  round: { id: string; name: string };
  guide: { title: string; label: string; questions: GuideQuestion[] };
  answers: Record<string, AnswerRow>;
  /** The client's previous finished conversation with the same guide (3.2); never its notes. */
  previous: Previous | null;
}
/** What was said and rated last time, per question (only questions with something in them). */
export interface PreviousAnswer {
  rating: Rating | null;
  answer: string;
  action: string;
}
export interface Previous {
  id: string;
  held_on: string | null;
  round: { id: string; name: string };
  counts: Counts;
  score: number | null;
  answers: Record<string, PreviousAnswer>;
}
export interface ClientInterview {
  id: string;
  status: Status;
  held_on: string | null;
  done_at: string | null;
  round: { id: string; name: string };
  counts: Counts;
  score: number | null;
  /** A finished conversation against the previous finished one with the same guide (3.2). */
  change?: {
    previous: { id: string; held_on: string | null; score: number | null };
    better: number;
    worse: number;
  } | null;
}

/** One answer in the overview (2.21): never a note. */
export interface Cell {
  rating: Rating | null;
  answer: string;
  action: string;
}
/** A question of the overview: the guide's texts without the rating criteria (3.1), which the overview
 * API does not send. */
export interface OverviewQuestion extends Omit<GuideQuestion, 'criteria'> {
  no: number;
  counts: Counts;
  /** Conversations with a conclusion written to this question. */
  actions: number;
}
export interface OverviewRow {
  id: string;
  status: Status;
  held_on: string | null;
  client: { id: string; name: string };
  round: { id: string; name: string };
  counts: Counts;
  score: number | null;
  actions: number;
  /** The questions of its own guide only. */
  cells: Record<string, Cell>;
}
/** The overview of one or more rounds (2.21), as the API counts it. */
export interface Overview {
  rounds: { id: string; name: string; questions: string[] }[];
  in_progress: boolean;
  questions: OverviewQuestion[];
  sections: { title: string; questions: string[]; counts: Counts; score: number | null }[];
  conversations: OverviewRow[];
  totals: {
    conversations: number;
    done: number;
    in_progress: number;
    shown: number;
    counts: Counts;
    score: number | null;
    actions: number;
  };
  actions: { question: string; clients: number; texts: { text: string; clients: number }[] }[];
}
/** The referat of one conversation for the client (2.21): never a note. */
export interface Referat {
  id: string;
  status: Status;
  held_on: string | null;
  done_at: string | null;
  client: { id: string; name: string };
  round: { id: string; name: string };
  interviewees: Person[];
  interviewers: string[];
  summary: string;
  agreed: string;
  counts: Counts;
  questions: {
    id: string;
    no: number;
    short: string;
    section: string;
    answer: string;
    rating: Rating | null;
    action: string;
  }[];
}

export const STATUS: Record<Status, string> = {
  planned: 'Ikkje starta',
  in_progress: 'Pågår',
  done: 'Fullført',
};

// Days and times are written out by hand, as elsewhere in the admin: not every browser carries
// Nynorsk (a Chrome without it wrote «09:53 PM» and «November 10, 2026»).
const two = (n: number) => String(n).padStart(2, '0');
/** 2026-11-25 → «25. november», with the year when it is not this year (the admin's own long date). */
export const longDate = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? dayInYear(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : '';
};
/** 2026-11-10 → 10.11.2026 */
export const dmy = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
/** Today in the browser's own time zone, as the API takes a day. */
export const today = (d = new Date()) =>
  `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
/** 21:53, on the 24-hour clock. */
export const clock = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

/** «Kari Nordmann, dagleg leiar · eigar» */
export const peopleText = (people: readonly Person[]) =>
  people.map((p) => [p.name, p.role].filter(Boolean).join(', ')).join(' · ');

/** Counts of the scale from the answers on screen (the API counts the same way). */
export function countOf(
  questions: readonly { id: string }[],
  rating: (id: string) => Rating | null,
): Counts {
  const c: Counts = { ivaretatt: 0, forbetring: 0, manglar: 0, ikkje_aktuelt: 0, none: 0 };
  for (const q of questions) {
    const r = rating(q.id);
    if (r) c[r] += 1;
    else c.none += 1;
  }
  return c;
}
/** Ivaretatt 2, Forbetringspotensial 1, Manglar 0; «Ikkje aktuelt» and unrated do not count. */
export const scoreOf = (c: Counts) => {
  const n = c.ivaretatt + c.forbetring + c.manglar;
  return n ? Math.round(((2 * c.ivaretatt + c.forbetring) / (2 * n)) * 100) : null;
};
export const rated = (c: Counts) => c.ivaretatt + c.forbetring + c.manglar + c.ikkje_aktuelt;

/** An error in words people use: a request that never reached Varde says so (the browser's own text is
 * «Failed to fetch», «Load failed» or «NetworkError …»). */
export const plain = (e: unknown) =>
  e instanceof TypeError && /fetch|network|load failed/i.test(e.message)
    ? new Error('Fekk ikkje kontakt med Varde. Prøv igjen når nettet er tilbake.')
    : e instanceof Error
      ? e
      : new Error('Noko gjekk gale.');

export const useInterviewRounds = () =>
  useQuery({
    queryKey: ['samtalar', 'rounds'],
    queryFn: () => api<RoundSummary[]>('/api/admin/interview-rounds'),
  });
export const useInterviewRound = (id: string | undefined) =>
  useQuery({
    queryKey: ['samtalar', 'round', id],
    queryFn: () => api<RoundView>(`/api/admin/interview-rounds/${id}`),
    enabled: id !== undefined,
  });
export const useGuides = () =>
  useQuery({
    queryKey: ['samtalar', 'guides'],
    queryFn: () => api<Guide[]>('/api/admin/interview-guides'),
  });
/** One conversation; read once per visit: what is typed lives in the save store afterwards. */
export const useInterview = (id: string) =>
  useQuery({
    queryKey: ['samtalar', 'interview', id],
    queryFn: () => api<Interview>(`/api/admin/interviews/${id}`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
export const useClientInterviews = (client: string) =>
  useQuery({
    queryKey: ['samtalar', 'client', client],
    queryFn: () => api<ClientInterview[]>(`/api/admin/clients/${client}/interviews`),
  });
/** The overview of the chosen rounds; the last answer stays on screen while another choice is read. */
export const useOverview = (rounds: readonly string[], inProgress: boolean) =>
  useQuery({
    queryKey: ['samtalar', 'overview', rounds.join(','), inProgress],
    queryFn: () =>
      api<Overview>(
        `/api/admin/interview-rounds/overview?rounds=${rounds.join(',')}${inProgress ? '&in_progress=true' : ''}`,
      ),
    enabled: rounds.length > 0,
    placeholderData: keepPreviousData,
  });
/** The referat: read once per visit, since every read is written to AuditLog. */
export const useReferat = (id: string) =>
  useQuery({
    queryKey: ['samtalar', 'referat', id],
    queryFn: () => api<Referat>(`/api/admin/interviews/${id}/referat`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
