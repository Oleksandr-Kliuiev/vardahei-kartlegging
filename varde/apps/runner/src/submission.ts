// Two independent submissions; retry always uses the original UUID and request bytes.
import type { TemplateContent } from '@varde/schema/template/template';
import { isLeader } from '@varde/rules/runner';
import type { Draft } from './draft.js';
import { submissionAnswers } from './path.js';

export async function sendDraft(
  code: string,
  version: TemplateContent,
  draft: Draft,
  confirmed: (part: 'common' | 'leader') => void,
  frozen?: (draft: Draft) => void,
): Promise<void> {
  const clean = submissionAnswers(version, draft.answers, draft.free);
  const leader = isLeader(version, clean.answers) && !draft.skip_leader;
  const parts: ('common' | 'leader')[] = leader ? ['common', 'leader'] : ['common'];
  if (!draft.requests) {
    const requests: Partial<Record<'common' | 'leader', string>> = {};
    for (const part of parts) {
      const ids = new Set(
        version.questions.filter((q) => q.part === part || q.identifier).map((q) => q.id),
      );
      const roleQuestion = version.questions.find((q) => q.role);
      requests[part] = JSON.stringify({
        submission_id: draft.submission_ids[part],
        part,
        lang: draft.lang,
        answers: Object.fromEntries(Object.entries(clean.answers).filter(([id]) => ids.has(id))),
        free: Object.fromEntries(Object.entries(clean.free).filter(([id]) => ids.has(id))),
        ...(part === 'leader' && roleQuestion ? { role: clean.answers[roleQuestion.id] } : {}),
        duration_s: Math.min(
          86400,
          Math.max(0, Math.round((Date.now() - draft.started_at) / 1000)),
        ),
      });
    }
    draft.requests = {
      common: requests.common!,
      ...(requests.leader ? { leader: requests.leader } : {}),
    };
    frozen?.(draft);
  }
  if (!leader) confirmed('leader'); // no leader part requested for this path
  for (const part of parts) {
    if (draft.confirmed?.[part]) continue;
    const res = await fetch('/api/runner/submissions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${code}`, 'Content-Type': 'application/json' },
      body: draft.requests[part]!,
    });
    if (res.status !== 201) throw new Error('Svara kom ikkje fram. Sjekk nettet og prøv igjen.');
    const body = (await res.json()) as { ok?: boolean; submission_id?: string };
    if (body.ok !== true || body.submission_id !== draft.submission_ids[part])
      throw new Error('Svara kom ikkje fram.');
    confirmed(part);
  }
}
