import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import type { Employees, Quotes } from './dashboard-models.js';
import { numberText } from './dashboard-models.js';
import { Zone } from './dashboard-aggregate.js';
import { ErrorMessage } from './queries.js';
import { Fold } from './fold.js';

/** Rows per employee: read (and logged) only when the block is opened. */
export function EmployeeSection({ query }: { query: string }) {
  return (
    <Fold title="Svar per tilsett" closed lazy>
      <EmployeeRows query={query} />
    </Fold>
  );
}
function EmployeeRows({ query }: { query: string }) {
  const result = useQuery({
    queryKey: ['responses', 'employees', query],
    queryFn: () => api<Employees>(`/api/admin/rows/per-employee?${query}`),
  });
  const data = result.data;
  return (
    <>
      <p className="under">
        Denne tabellen er berre for Vardahei IT; bedrifta får eit samla bilete utan initialar.
      </p>
      <ErrorMessage error={result.error} />
      {data && (
        <>
          {data.summary.matched > 0 && (
            <p>
              Av dei {data.summary.matched} som svarte begge gongene: {data.summary.better} betre,{' '}
              {data.summary.worse} verre, {data.summary.same} omtrent likt.
            </p>
          )}
          <div className="tabell-wrap">
            <table className="tilsette">
              <thead>
                <tr>
                  <th>Initialar</th>
                  <th>Rolle</th>
                  {!data.client && <th>Kunde</th>}
                  {data.template === 'ki' ? (
                    <>
                      {data.columns.map((c) => (
                        <th key={c.id}>{c.label}</th>
                      ))}
                      {data.previous_round && <th>Førre runde</th>}
                    </>
                  ) : (
                    <>
                      <th>Snittscore</th>
                      <th>Sone</th>
                      <th>{data.previous_round?.name ?? 'Førre runde'}</th>
                      <th>Oransje og raud</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.submission_id}>
                    <th scope="row">{r.respondent_key || '–'}</th>
                    <td>{r.role}</td>
                    {!data.client && <td>{r.client_name}</td>}
                    {data.template === 'ki' ? (
                      <>
                        {r.columns.map((c) => (
                          <td key={c.id} className={c.marked ? 'merk' : ''}>
                            {c.label}
                          </td>
                        ))}
                        {data.previous_round && (
                          <td>
                            {r.previous?.label ?? '–'}
                            {r.previous?.change && ` → ${r.previous.change}`}
                          </td>
                        )}
                      </>
                    ) : (
                      <>
                        <td>{numberText(r.mean)}</td>
                        <td>
                          <Zone zone={r.zone} />
                        </td>
                        <td>
                          {r.previous ? (
                            <>
                              <Zone zone={r.previous.zone} /> {numberText(r.previous.mean)}{' '}
                              {r.previous.change}
                            </>
                          ) : (
                            '–'
                          )}
                        </td>
                        <td>
                          {r.marked.length ? (
                            <>
                              {r.marked.slice(0, 5).map((m, i) => (
                                <span className={`m${m.score}`} key={m.id}>
                                  {i ? ', ' : ''}
                                  {m.label}
                                </span>
                              ))}
                              {r.marked.length > 5 && ` +${r.marked.length - 5}`}
                            </>
                          ) : (
                            '–'
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
/** Free-text answers: read (and logged) only when the block is opened. */
export function QuotesSection({ query, showClient }: { query: string; showClient: boolean }) {
  return (
    <Fold title="Sitat frå tilsette" closed lazy>
      <QuoteRows query={query} showClient={showClient} />
    </Fold>
  );
}
function QuoteRows({ query, showClient }: { query: string; showClient: boolean }) {
  const result = useQuery({
    queryKey: ['responses', 'quotes', query],
    queryFn: () => api<Quotes>(`/api/admin/rows/quotes?${query}`),
  });
  const quotes = result.data?.quotes ?? [];
  const questions = [...new Set(quotes.map((q) => q.question))];
  return (
    <>
      <ErrorMessage error={result.error} />
      {questions.length ? (
        questions.map((id) => (
          <div key={id}>
            <h3>{quotes.find((q) => q.question === id)?.label}</h3>
            <ul className="sitat-liste">
              {quotes
                .filter((q) => q.question === id)
                .map((q, i) => (
                  <li key={`${q.submission_id}-${i}`}>
                    <blockquote>{q.text}</blockquote>
                    <details>
                      <summary>Innsendings-ID for sletting</summary>
                      <code>{q.submission_id}</code>
                    </details>
                    <span className="kjelde">
                      {[showClient ? q.client_name : null, q.role].filter(Boolean).join(', ')}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="under">
          {result.data ? 'Ingen fritekstsvar i dette utvalet enno.' : 'Hentar sitata …'}
        </p>
      )}
    </>
  );
}
