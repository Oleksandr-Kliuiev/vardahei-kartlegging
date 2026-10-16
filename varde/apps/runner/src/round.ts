import type { TemplateContent } from '@varde/schema/template/template';
import type { Lang } from '@varde/schema/template/texts';

export interface RunnerRound {
  round_client_id: string;
  client: { name: string; default_lang: string };
  version: { id: string; label: string; identification: 'none' | 'initials'; required_languages: Lang[]; content: TemplateContent };
  status: string;
  deadline: string | null;
  expires: string | null;
}
export class RunnerError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
/** A seminar live poll answers `/api/runner/round` with this only (3.6): its questions come one
 * by one from `/api/runner/live`. */
export interface LiveRound {
  type: 'live';
}
export const isLive = (r: RunnerRound | LiveRound): r is LiveRound => 'type' in r && r.type === 'live';

export async function loadRound(code: string, signal?: AbortSignal): Promise<RunnerRound | LiveRound> {
  const res = await fetch('/api/runner/round', { headers: { Authorization: `Bearer ${code}` }, cache: 'no-store', signal: signal ?? null });
  if (!res.ok) {
    const error = await res.json() as { message?: string };
    throw new RunnerError(res.status, error.message ?? 'Lenkja er ikkje gyldig.');
  }
  return await res.json() as RunnerRound | LiveRound;
}
