import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import type { Leader, LeaderSummary } from './dashboard-models.js';
import { Findings, QuestionBlock } from './dashboard-aggregate.js';
import { ErrorMessage } from './queries.js';
import { Fold } from './fold.js';

function LeaderClient({ round, client }: { round: string; client: string }) {
  const result = useQuery({
    queryKey: ['responses', 'leader', round, client],
    queryFn: () => api<Leader>(`/api/admin/clients/${client}/leader-answers?round=${round}`),
  });
  const data = result.data;
  return (
    <>
      <p className="under">Leiarsvara er ikkje anonyme. Éi rad per leiar som har svart.</p>
      <ErrorMessage error={result.error} />
      {data && (
        <>
          <Findings findings={data.findings} />
          <div className="tabell-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kunde</th>
                  {data.columns.map((c) => (
                    <th key={c.id}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.table.map((r) => (
                  <tr key={r.submission_id}>
                    <th scope="row">{data.client_name}</th>
                    {r.cells.map((c, i) => (
                      <td key={i}>
                        <span className={`leader-signal ${r.signals[i] ?? ''}`}>
                          <i aria-hidden="true" />
                          {c}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rows.map((row) => (
            <details key={row.submission_id}>
              <summary>Alle svar frå leiaren</summary>
              <dl>
                {data.questions.map((q) => (
                  <div key={q.id}>
                    <dt>{q.label}</dt>
                    <dd>
                      {row.display[q.id] ?? '–'}
                      {typeof row.free[q.id] === 'string' && (
                        <blockquote>{row.free[q.id] as string}</blockquote>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
        </>
      )}
    </>
  );
}
function LeaderAll({ round }: { round: string }) {
  const result = useQuery({
    queryKey: ['responses', 'leader-summary', round],
    queryFn: () => api<LeaderSummary>(`/api/admin/leader-answers?round=${round}`),
  });
  return (
    <>
      <p className="under">
        Samla svar frå leiarane, utan namn på kundar. Små grupper er ikkje viste.
      </p>
      <ErrorMessage error={result.error} />
      {result.data && (
        <>
          <Findings findings={result.data.findings} />
          <div className="rutenett">
            {result.data.questions.map((q) => (
              <QuestionBlock key={q.id} question={q} leaders />
            ))}
          </div>
        </>
      )}
    </>
  );
}
export function LeaderSection({ round, client }: { round: string; client: string }) {
  return (
    <Fold title="Leiarane">
      {client ? <LeaderClient round={round} client={client} /> : <LeaderAll round={round} />}
    </Fold>
  );
}
