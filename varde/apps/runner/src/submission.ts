// Minimal transport for draft confirmation; server acceptance/quotas are checkpoint 1b's next run.
import type { TemplateContent } from '@varde/schema/template/template';
import { isLeader } from '@varde/rules/runner';
import type { Draft } from './draft.js';
import { submissionAnswers } from './path.js';

export async function sendDraft(code: string, version: TemplateContent, draft: Draft, confirmed: (part: 'common' | 'leader') => void): Promise<void> {
  const clean = submissionAnswers(version, draft.answers, draft.free);
  const leader = isLeader(version, clean.answers);
  if (!leader) confirmed('leader'); // no leader part requested for this path
  const parts: ('common' | 'leader')[] = leader ? ['common', 'leader'] : ['common'];
  for (const part of parts) {
    if (draft.confirmed?.[part]) continue;
    const ids = new Set(version.questions.filter((q) => q.part === part || q.identifier).map((q) => q.id));
    const roleQuestion = version.questions.find((q) => q.role);
    const res = await fetch('/api/runner/submissions', {
      method: 'POST', headers: { Authorization: `Bearer ${code}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submission_id: draft.submission_ids[part], part, lang: draft.lang,
        answers: Object.fromEntries(Object.entries(clean.answers).filter(([id]) => ids.has(id))),
        free: Object.fromEntries(Object.entries(clean.free).filter(([id]) => ids.has(id))),
        ...(part === 'leader' && roleQuestion ? { role: clean.answers[roleQuestion.id] } : {}),
      }),
    });
    if (res.status !== 201) throw new Error('Svara kom ikkje fram. Sjekk nettet og prøv igjen.');
    const body = await res.json() as { ok?: boolean; submission_id?: string };
    if (body.ok !== true || body.submission_id !== draft.submission_ids[part]) throw new Error('Svara kom ikkje fram.');
    confirmed(part);
  }
}
