// «Framdrift» of one round (the round page, 2.17): key numbers, the trail per client, the table and
// where people stop. Only aggregates from the progress API (ADR-021).
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import type { Cell, Progress, Round } from './models.js';
import { ErrorMessage } from './queries.js';
import { ClientTrails, Kpis } from './overview.js';

const value = (cell: Cell) => (cell.suppressed ? '–' : cell.value);
/** The progress of one round, shared by «I dag», the round page and its client cards. */
export const progressQuery = (id: string) => ({
  queryKey: ['progress', id],
  queryFn: () =>
    api<{ class: 'aggregate'; clients: Progress[] }>(`/api/admin/rounds/${id}/progress`),
  // Active sessions expire without a write, so refresh the time-derived cells too.
  refetchInterval: 60_000,
});
export function ProgressRound({ round }: { round: Round }) {
  const progress = useQuery(progressQuery(round.id));
  const clients = progress.data?.clients ?? [];
  return (
    <>
      <Kpis clients={clients} />
      <div className="flate">
        <ClientTrails round={round} clients={clients} />
      </div>
      <section className="del">
        <h2>Framdrift i {round.name}</h2>
        <p className="under">
          Kolonnane viser tal tilsette, svar og prosent, aktive økter, avbrot, siste svardag og
          median svartid. Aktive økter: siste 15 minutt; avbrot: minst 30 minutt utan aktivitet. Små
          grupper er ikkje viste. «–» tyder at talet ikkje er tilgjengeleg.
        </p>
        <ErrorMessage error={progress.error} />
        <div className="tabell-wrap">
          <table className="framdrift">
            <thead>
              <tr>
                <th scope="col">Kunde</th>
                <th scope="col">Tilsette i runden</th>
                <th scope="col">Svar / oppslutning</th>
                <th scope="col">Aktive økter</th>
                <th scope="col">Avbrotne økter</th>
                <th scope="col">Siste svardag</th>
                <th scope="col">Median svartid</th>
              </tr>
            </thead>
            <tbody>
              {round.round_clients.map((rc) => {
                const p = clients.find((p) => p.round_client_id === rc.id);
                if (!p) return null;
                const percent = p.population_snapshot
                  ? Math.round((100 * p.responses_total) / p.population_snapshot)
                  : null;
                return (
                  <tr key={rc.id} aria-label={rc.client.name}>
                    <th scope="row">{rc.client.name}</th>
                    <td>{p.population_snapshot ?? '–'}</td>
                    <td className="prosent">
                      <div className="linje">
                        <b>{p.responses_total} svar</b>
                        <span>{percent === null ? '–' : `${Math.min(999, percent)} %`}</span>
                      </div>
                      {p.population_snapshot !== null && (
                        <progress
                          max={p.population_snapshot}
                          value={p.responses_total}
                          aria-label={`Oppslutning for ${rc.client.name}`}
                        />
                      )}
                    </td>
                    <td>{value(p.in_progress)}</td>
                    <td>{value(p.abandoned)}</td>
                    <td>{p.last_response_day?.slice(0, 10) ?? '–'}</td>
                    <td>
                      {p.median_duration_s.suppressed
                        ? '–'
                        : p.median_duration_s.value < 60
                          ? 'under 1 min.'
                          : `${Math.round(p.median_duration_s.value / 60)} min.`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="del">
        <h2>Kvar stoppar folk</h2>
        <p className="under">
          Berre grupper med minst 3 økter er viste. Framdrifta gjeld dei siste 24 timane.
        </p>
        <div className="rutenett">
          {clients.map((p) => (
            <div key={p.round_client_id} className="skjemablokk">
              <h3>{round.round_clients.find((rc) => rc.id === p.round_client_id)?.client.name}</h3>
              <p>
                {p.started.suppressed
                  ? `Færre enn 3 økter siste døgn, så talet blir ikkje vist. ${p.responses_total} svar sende.`
                  : `${p.started.value} økter starta, ${p.responses_total} svar sende.`}
              </p>
              <ul>
                {Object.entries(p.stopped)
                  .filter(([, cell]) => !cell.suppressed)
                  .sort(([, a], [, b]) => Number(value(b)) - Number(value(a)))
                  .map(([question, cell]) => (
                    <li key={question} data-question={question}>
                      {question === '0' ? 'Før første spørsmål' : `Spørsmål ${question}`}:{' '}
                      {value(cell)} avbrote
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
