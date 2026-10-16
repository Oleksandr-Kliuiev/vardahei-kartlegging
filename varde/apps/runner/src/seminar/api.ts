// Calls of the seminar page (3.2): the code from `?c=` goes as a bearer in Authorization, never
// in a URL the server sees. Server messages are nynorsk; the page shows its own text per status.
import type { SemLang } from './texts.js';

export interface ConsentText {
  /** Beside the required box: storing the details for this registration. */
  short: string;
  /** Beside the optional box: invitations to later seminars. */
  invite: string;
  full: string[];
}
export interface PublicSeminar {
  languages: SemLang[];
  topic: Partial<Record<SemLang, string>>;
  when: Partial<Record<SemLang, string>>;
  place: string;
  format: 'onsite' | 'digital';
  /** Clients of the seminar to pick as company: `key` is the client's slug, never a database id. */
  clients: { key: string; name: string }[];
  phase: 'open' | 'held';
  consent: ({ version: string; invite_version: string } & Partial<Record<SemLang, ConsentText>>) | null;
  materials?: { title: string; url: string }[];
}
export interface Registration {
  name: string;
  email: string;
  company: { client: string } | { name: string };
  consent: string;
  /** Only when the box for invitations is ticked. */
  invite?: string;
  lang: SemLang;
  website?: string;
}

export class SeminarError extends Error {
  constructor(
    readonly status: number,
    /** A replaced link (ADR-009) is a 403 that says so. */
    readonly replaced = false,
  ) {
    super(`seminar ${status}`);
  }
}

const auth = (code: string) => ({ Authorization: `Bearer ${code}` });

async function call(path: string, code: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      cache: 'no-store',
      headers: { ...auth(code), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch {
    throw new SeminarError(0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const message = typeof body?.message === 'string' ? body.message : '';
    throw new SeminarError(res.status, res.status === 403 && message.startsWith('Lenkja er bytt ut'));
  }
  return res;
}

export async function loadSeminar(code: string, signal?: AbortSignal): Promise<PublicSeminar> {
  return (await (await call('/api/public/seminar', code, { signal: signal ?? null })).json()) as PublicSeminar;
}

export async function register(code: string, body: Registration): Promise<void> {
  await call('/api/public/seminar/registrations', code, { method: 'POST', body: JSON.stringify(body) });
}

/** The calendar file is fetched with the bearer and saved from memory (no code in a URL). */
export async function saveCalendar(code: string, lang: SemLang): Promise<void> {
  const res = await call(`/api/public/seminar/calendar?lang=${lang}`, code);
  const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seminar.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
