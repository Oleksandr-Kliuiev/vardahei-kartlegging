// Shapes of the seminar's «Live» tab (3.4, 3.5): the same snapshot the big screen gets (texts,
// states, «N har svart», a shown result after privacy), the versions that can become a live poll and
// the state of the presenter key (never the key).
export type LiveState = 'waiting' | 'open' | 'closed' | 'released';
export type LiveAction = 'open' | 'close' | 'release';
export interface LiveText {
  nn: string;
  en?: string;
}
export type LiveResult =
  | { class: 'aggregate'; suppressed: true }
  | {
      class: 'aggregate';
      suppressed: false;
      n: number;
      options: { id: string; count: number; share: number }[];
    };
export interface LiveQuestion {
  id: string;
  no: number;
  state: LiveState;
  text: LiveText;
}
export interface LiveSnapshot {
  round: string;
  seminar: { id: string; topic: LiveText; when: string };
  languages: string[];
  link: string | null;
  qr: string | null;
  total: number;
  questions: LiveQuestion[];
  current:
    | (LiveQuestion & {
        multi: boolean;
        options: { id: string; text: LiveText }[];
        answered: number | null;
        result: LiveResult | null;
      })
    | null;
  at: string;
}
export interface LivePanel {
  poll: LiveSnapshot | null;
  versions: { id: string; key: string; label: string; questions: number; problem: string | null }[];
  presenter: {
    valid_from: string;
    valid_to: string;
    valid_text: string;
    valid_now: boolean;
    active: { issued_at: string; issued_by: string } | null;
  };
}
export interface IssuedKey {
  link: string;
  valid_text: string;
}

export const STATE_LABEL: Record<LiveState, string> = {
  waiting: 'Ventar',
  open: 'Ope',
  closed: 'Stengt',
  released: 'Vist',
};

/** The chain on the question card: «Ope → Stengt → Vist». */
export const CHAIN: readonly LiveState[] = ['open', 'closed', 'released'];

/** The question the panel works on: the open one, the one changed last, else the first waiting. */
export function leading(s: LiveSnapshot): LiveQuestion | undefined {
  return (
    s.questions.find((q) => q.state === 'open') ??
    s.questions.find((q) => q.id === s.current?.id) ??
    s.questions.find((q) => q.state === 'waiting')
  );
}

/** «12 har svart» / «1 har svart». */
export const answeredText = (n: number) => `${n} har svart`;

export const percent = (share: number) => `${Math.round(share * 100)} %`;
