import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import type { Comparison, ComparisonRow } from './dashboard-models.js';
import { numberText, percent } from './dashboard-models.js';
import { Zone } from './dashboard-aggregate.js';
import { ErrorMessage } from './queries.js';
import { Fold } from './fold.js';

function Change({ value, points = false }: { value: ComparisonRow['change']; points?: boolean }) {
  if (!value) return <>–</>;
  return (
    <span className={value.kind === 'betre' ? 'pil-ned' : value.kind === 'verre' ? 'pil-opp' : ''}>
      {value.kind === 'likt'
        ? 'likt'
        : `${value.delta > 0 ? '+' : '−'}${points ? Math.abs(value.delta) + ' poeng' : numberText(Math.abs(value.delta))}, ${value.kind}`}
    </span>
  );
}
function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="tabell-wrap">
      <table>
        <thead>
          <tr>
            <th>Gruppe / spørsmål</th>
            <th>Runde 1</th>
            <th>No</th>
            <th>Endring</th>
            <th>Kritisk runde 1</th>
            <th>Kritisk no</th>
            <th>Endring</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.id === 'all' ? 'sumrad' : ''}>
              <th scope="row">{r.label}</th>
              <td>
                {numberText(r.before.mean)} <Zone zone={r.before.zone} />
              </td>
              <td>
                {numberText(r.now.mean)} <Zone zone={r.now.zone} />
              </td>
              <td>
                <Change value={r.change} />
              </td>
              <td>{percent(r.before.critical)}</td>
              <td>{percent(r.now.critical)}</td>
              <td>
                <Change value={r.critical_change} points />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ComparisonSection({ query, showClients }: { query: string; showClients: boolean }) {
  const result = useQuery({
    queryKey: ['responses', 'comparison', query],
    queryFn: () => api<Comparison | null>(`/api/admin/dashboard/comparison?${query}`),
  });
  const data = result.data;
  if (!data && !result.error) return null;
  return (
    <Fold title="Samanlikning med runde 1">
      <ErrorMessage error={result.error} />
      {data && (
        <>
          <p className="under">{data.note}</p>
          <p>Lågare snittscore og lågare kritisk andel er betre.</p>
          {showClients && (
            <>
              <h3>Per kunde</h3>
              <ComparisonTable rows={data.clients} />
            </>
          )}
          <h3>Per spørsmål</h3>
          {data.not_yet.length > 0 && (
            <p className="under">
              Berre kundar som har svart i begge rundane. Ikkje med enno: {data.not_yet.join(', ')}.
            </p>
          )}
          <ComparisonTable rows={[...data.questions, data.total]} />
        </>
      )}
    </Fold>
  );
}
