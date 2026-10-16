// Shapes of a seminar live poll (3.4, 3.5): one snapshot serves the admin panel, the presenter API
// and its SSE stream. It holds texts, states, the count «N har svart» and, for a shown question,
// the result that privacy let through (k = 3) — never an answer, a free text or a row.
import type { LocalizedText } from '@varde/schema/template/texts';
import type { LiveResult } from '../privacy/privacy.service.js';

export type LiveState = 'waiting' | 'open' | 'closed' | 'released';
export type LiveAction = 'open' | 'close' | 'release';
export const LIVE_ACTIONS: readonly LiveAction[] = ['open', 'close', 'release'];

export interface LiveQuestionSummary {
  id: string;
  /** 1-based place in the poll. */
  no: number;
  state: LiveState;
  text: LocalizedText;
}

export interface LiveCurrent extends LiveQuestionSummary {
  multi: boolean;
  options: { id: string; text: LocalizedText }[];
  /** «N har svart» while open or closed: how many answered (ADR-021 rule 6), never what. Null
   * once shown: the result speaks then, and below k nothing with a number leaves. */
  answered: number | null;
  /** Only for a shown question: class aggregate, suppressed below k. */
  result: LiveResult | null;
}

export interface LiveSnapshot {
  round: string;
  seminar: { id: string; topic: { nn: string; en?: string }; when: string };
  languages: string[];
  /** The participant link of the poll (shown as QR and text on the big screen). */
  link: string | null;
  qr: string | null;
  total: number;
  questions: LiveQuestionSummary[];
  /** The open question, or the one changed last; null before the first is opened. */
  current: LiveCurrent | null;
  /** Time of the latest change (ISO). */
  at: string;
}

/** What a participant's phone gets (3.6): only the open question, nothing of the others. */
export type ParticipantLive =
  | {
      state: 'waiting' | 'between' | 'done';
      languages: string[];
      topic: { nn: string; en?: string };
    }
  | {
      state: 'open';
      languages: string[];
      topic: { nn: string; en?: string };
      no: number;
      total: number;
      question: unknown;
    };
