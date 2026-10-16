// A phone in a seminar live poll (3.6): it asks `GET /api/runner/live` every few seconds (no SSE
// for participants, ADR-015) and sends each answer through the ordinary Submission API (ADR-006).
// The code from `?c=` goes as a bearer, never in a URL the server sees. The draft keeps, per
// question, the submission id and the exact request bytes, so a lost acknowledgement is sent again
// unchanged and never makes a second answer; it lives under the code's draft prefix, so a closed
// link removes it with the survey drafts (expireCodeDrafts).
import type { AnswerValue } from '@varde/rules/runner';
import type { Question } from '@varde/schema/template/question';
import type { Lang } from '@varde/schema/template/texts';
import { browserStorage, draftKey, type DraftStorage } from '../draft.js';
import { RunnerError } from '../round.js';

export interface LiveTopic {
  nn: string;
  en?: string;
}
export type LiveView =
  | { state: 'waiting' | 'between' | 'done'; languages: Lang[]; topic: LiveTopic }
  | {
      state: 'open';
      languages: Lang[];
      topic: LiveTopic;
      no: number;
      total: number;
      question: Question;
    };

export async function loadLive(code: string, signal?: AbortSignal): Promise<LiveView> {
  let res: Response;
  try {
    res = await fetch('/api/runner/live', {
      headers: { Authorization: `Bearer ${code}` },
      cache: 'no-store',
      signal: signal ?? null,
    });
  } catch {
    throw new RunnerError(0, '');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    throw new RunnerError(res.status, typeof body?.message === 'string' ? body.message : '');
  }
  return (await res.json()) as LiveView;
}

export interface LiveItem {
  submission_id: string;
  value?: AnswerValue;
  /** Frozen at the first send: a retry sends these bytes again. */
  request?: string;
  confirmed?: boolean;
  /** The server said «Spørsmålet er stengt.» before this answer got in. */
  closed?: boolean;
}
export interface LiveDraft {
  lang: Lang | null;
  items: Record<string, LiveItem>;
}

export const liveDraftKey = (code: string) => draftKey(code, 'live');

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validItem(v: unknown): v is LiveItem {
  return (
    record(v) &&
    typeof v.submission_id === 'string' &&
    UUID.test(v.submission_id) &&
    (v.request === undefined || typeof v.request === 'string') &&
    (v.confirmed === undefined || typeof v.confirmed === 'boolean') &&
    (v.closed === undefined || typeof v.closed === 'boolean') &&
    (v.value === undefined ||
      typeof v.value === 'string' ||
      (Array.isArray(v.value) && v.value.every((x) => typeof x === 'string')))
  );
}

export function loadLiveDraft(
  key: string,
  storage: DraftStorage | null = browserStorage(),
): LiveDraft {
  try {
    const raw = storage?.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (
      record(value) &&
      record(value.items) &&
      Object.values(value.items).every(validItem) &&
      (value.lang === null || value.lang === 'nn' || value.lang === 'en' || value.lang === 'nb')
    )
      return { lang: value.lang, items: value.items as Record<string, LiveItem> };
  } catch {
    /* A broken draft is dropped. */
  }
  return { lang: null, items: {} };
}

export function saveLiveDraft(
  key: string,
  draft: LiveDraft,
  storage: DraftStorage | null = browserStorage(),
) {
  try {
    storage?.setItem(key, JSON.stringify(draft));
  } catch {
    /* Answers still go without storage. */
  }
}

export type SendOutcome = 'sent' | 'closed' | 'failed';

/** Sends the frozen request of one answer; 201 also for a replay of an answer already stored. */
export async function sendAnswer(code: string, request: string): Promise<SendOutcome> {
  let res: Response;
  try {
    res = await fetch('/api/runner/submissions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${code}`, 'Content-Type': 'application/json' },
      body: request,
    });
  } catch {
    return 'failed';
  }
  if (res.status === 201) return 'sent';
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    if (body?.message === 'Spørsmålet er stengt.') return 'closed';
  }
  return 'failed';
}

export function liveRequest(
  item: LiveItem,
  question: string,
  value: AnswerValue,
  lang: Lang,
): string {
  return JSON.stringify({
    submission_id: item.submission_id,
    part: 'common',
    lang,
    answers: { [question]: value },
  });
}
