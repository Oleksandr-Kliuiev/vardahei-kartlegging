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
export async function loadRound(code: string, signal?: AbortSignal): Promise<RunnerRound> {
  const res = await fetch('/api/runner/round', { headers: { Authorization: `Bearer ${code}` }, cache: 'no-store', signal: signal ?? null });
  if (!res.ok) {
    const error = await res.json() as { message?: string };
    throw new RunnerError(res.status, error.message ?? 'Lenkja er ikkje gyldig.');
  }
  return await res.json() as RunnerRound;
}
