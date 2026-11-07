// The actions of the catalogue chosen in the client's conversations (2.22b, decision 3.3 of 07.11), under
// the findings of its rounds in «Funn» on the client page: per action its seminar topic, the question and
// the conversation it came from, and the follow-up with the status control of the findings (open, taken
// up at a seminar, done; AuditLog on the server). The open ones are listed; the done ones fold under
// «Ferdige», so a mistake can still be undone. Nothing typed in the conversation is shown here.
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import type { FollowUp } from './kunde-funn.js';
import { follow } from './nav.js';
import { ErrorMessage } from './queries.js';
import { dmy } from './samtale-models.js';
import './samtale-tiltak.css';

/** One action chosen for one question of one conversation, as `GET clients/:id/interview-actions` gives it. */
export interface ChosenAction extends FollowUp {
  interview: string;
  conversation: {
    status: 'planned' | 'in_progress' | 'done';
    held_on: string | null;
    round: { id: string; name: string };
  };
  question: { id: string; no: number; short: string };
  action: { id: string; name: string; seminar_topic: string };
}

/** Where the status of one chosen action goes. */
export const statusUrl = (r: ChosenAction) =>
  `/api/admin/interviews/${r.interview}/actions/${encodeURIComponent(r.question.id)}/${r.action.id}/status`;

/** Under the `seminars` key, so a status saved by the control of the findings reads the list again. */
export const useChosenActions = (client: string) =>
  useQuery({
    queryKey: ['seminars', 'samtale-tiltak', client],
    queryFn: () => api<{ rows: ChosenAction[] }>(`/api/admin/clients/${client}/interview-actions`),
    staleTime: 0,
  });

function Rad({
  row,
  status,
}: {
  row: ChosenAction;
  status: (row: ChosenAction, text: string, to: string) => ReactNode;
}) {
  const to = `/admin/samtalar/${row.interview}?q=${encodeURIComponent(row.question.id)}`;
  const day = dmy(row.conversation.held_on);
  return (
    <li>
      <p className="kst-namn">{row.action.name}</p>
      <p className="kst-meta">Seminartema: {row.action.seminar_topic}</p>
      <p className="kst-meta">
        Spørsmål {row.question.no} «{row.question.short}» ·{' '}
        <a href={to} onClick={(e) => follow(e, to)}>
          {row.conversation.round.name}
          {day && `, ${day}`}
        </a>
      </p>
      {status(row, `${row.action.name} (spørsmål ${row.question.no})`, statusUrl(row))}
    </li>
  );
}

export function KundeSamtaleTiltak({
  client,
  status,
}: {
  client: string;
  /** The status control of the findings, for one chosen action. */
  status: (row: ChosenAction, text: string, to: string) => ReactNode;
}) {
  const q = useChosenActions(client);
  const rows = Array.isArray(q.data?.rows) ? q.data.rows : [];
  if (!rows.length && !q.error) return null;
  const open = rows.filter((r) => r.status !== 'closed');
  const done = rows.filter((r) => r.status === 'closed');
  const key = (r: ChosenAction) => `${r.interview}:${r.question.id}:${r.action.id}`;
  return (
    <section className="kunde-samtale-tiltak" aria-labelledby="kunde-samtale-tiltak">
      <h3 id="kunde-samtale-tiltak">Tiltak frå samtalane</h3>
      <p className="forklaring">Valt under «Konklusjon og tiltak» i samtalane med kunden.</p>
      <ErrorMessage error={q.error} />
      {open.length > 0 ? (
        <ul>
          {open.map((r) => (
            <Rad key={key(r)} row={r} status={status} />
          ))}
        </ul>
      ) : (
        rows.length > 0 && <p className="under">Alle tiltaka frå samtalane er ferdige.</p>
      )}
      {done.length > 0 && (
        <details className="kst-ferdige">
          <summary>Ferdige ({done.length})</summary>
          <ul>
            {done.map((r) => (
              <Rad key={key(r)} row={r} status={status} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
