// Calls of the seminar page (3.2): the code from `?c=` goes as a bearer in Authorization, never
// in a URL the server sees. Server messages are nynorsk; the page shows its own text per status.
import type { SemLang } from './texts.js';

export interface ConsentText {
  short: string;
  full: string[];
}
export interface PublicSeminar {
  languages: SemLang[];
  topic: Partial<Record<SemLang, string>>;
  when: Partial<Record<SemLang, string>>;
  place: string;
  format: 'onsite' | 'digital';
  clients: { id: string; name: string }[];
  phase: 'open' | 'held';
  consent: ({ version: string } & Partial<Record<SemLang, ConsentText>>) | null;
  materials?: { title: string; url: string }[];
}
export interface Registration {
  name: string;
  email: string;
  company: { client: string } | { name: string };
  consent: string;
  lang: SemLang;
  website?: string;
}

export class SeminarError extends Error {
  constructor(readonly status: number) {
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
  if (!res.ok) throw new SeminarError(res.status);
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
