import type { Answers } from '@varde/rules/runner';
import type { Lang } from '@varde/schema/template/texts';

export interface Draft {
  answers: Answers;
  free: Record<string, string>;
  step: number;
  lang: Lang;
  started_at: number;
  submission_ids: { common: string; leader: string };
  expires: string | null;
  /** Confirmed parts survive a lost connection between independent submissions. */
  confirmed?: { common: boolean; leader: boolean };
}
export interface DraftStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function browserStorage(): DraftStorage | null {
  try { return localStorage; } catch { return null; }
}
export async function draftKey(code: string, version: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `varde:${hash.slice(0, 16)}:${version}`;
}
export function newDraft(lang: Lang, expires: string | null): Draft {
  return { answers: {}, free: {}, step: -1, lang, started_at: Date.now(),
    submission_ids: { common: crypto.randomUUID(), leader: crypto.randomUUID() }, expires };
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function valid(value: unknown): value is Draft {
  if (!record(value) || !record(value.answers) || !record(value.free) || !record(value.submission_ids)) return false;
  const answerValid = Object.values(value.answers).every((v) => typeof v === 'string' ||
    (typeof v === 'number' && Number.isFinite(v)) ||
    (Array.isArray(v) && v.every((x: unknown) => typeof x === 'string')) ||
    (record(v) && Object.values(v).every((x) => typeof x === 'number' && Number.isFinite(x))));
  return answerValid && Object.values(value.free).every((v) => typeof v === 'string') &&
    typeof value.step === 'number' && Number.isInteger(value.step) && value.step >= -1 &&
    ['nn', 'nb', 'en'].includes(String(value.lang)) && typeof value.started_at === 'number' && Number.isFinite(value.started_at) &&
    uuid(value.submission_ids.common) && uuid(value.submission_ids.leader) && value.submission_ids.common !== value.submission_ids.leader &&
    (value.expires === null || (typeof value.expires === 'string' && Number.isFinite(Date.parse(value.expires)))) &&
    (value.confirmed === undefined || (record(value.confirmed) && typeof value.confirmed.common === 'boolean' && typeof value.confirmed.leader === 'boolean'));
}
export function removeDraft(key: string, storage = browserStorage()): void {
  try { storage?.removeItem(key); } catch { /* Private browsing or a full store must not interrupt the survey. */ }
}
export function saveDraft(key: string, value: Draft, storage = browserStorage()): void {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* In-memory answers still work. */ }
}
export function loadDraft(key: string, languages: readonly Lang[], expires: string | null, storage = browserStorage(), now = Date.now()): Draft | null {
  try {
    if (storage === null) return null;
    const prefix = key.slice(0, key.lastIndexOf(':') + 1);
    const foreign: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const candidate = storage.key(i);
      if (candidate?.startsWith(prefix) && candidate !== key) foreign.push(candidate);
    }
    for (const candidate of foreign) storage.removeItem(candidate);
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!valid(value) || !languages.includes(value.lang) ||
      (value.expires !== null && Date.parse(value.expires) <= now) ||
      (expires !== null && Date.parse(expires) <= now)) {
      removeDraft(key, storage);
      return null;
    }
    return { ...value, expires }; // current server deadline also covers shortened/extended rounds
  } catch {
    removeDraft(key, storage);
    return null;
  }
}
export function confirmDraft(key: string, draft: Draft, part: 'common' | 'leader', storage = browserStorage()): Draft {
  const next = { ...draft, confirmed: { common: false, leader: false, ...draft.confirmed, [part]: true } };
  if (next.confirmed.common && next.confirmed.leader) removeDraft(key, storage);
  else saveDraft(key, next, storage);
  return next;
}

/** A closed/expired bearer no longer has version metadata; remove its drafts by hash prefix. */
export async function expireCodeDrafts(code: string, storage = browserStorage()): Promise<void> {
  if (storage === null) return;
  const prefix = await draftKey(code, '');
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) removeDraft(key, storage);
  } catch { /* An inaccessible store still must not interrupt the closed-link screen. */ }
}
