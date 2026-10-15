import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import type { Cell, Progress, Round } from './models.js';
import { ErrorMessage, useRounds } from './queries.js';
import { AuditLog } from './rounds-page.js';
import { ClientTrails, Kpis, OverviewIntro } from './overview.js';

const value = (cell: Cell) => (cell.suppressed ? '–' : cell.value);
export function ProgressRound({ round }: { round: Round }) {
  const progress = useQuery({
    queryKey: ['progress', round.id],
    queryFn: () =>
      api<{ class: 'aggregate'; clients: Progress[] }>(`/api/admin/rounds/${round.id}/progress`),
    // Active sessions expire without a write, so refresh the time-derived cells too.
    refetchInterval: 60_000,
  });
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
        {clients.map((p) => (
          <div key={p.round_client_id} className="skjemablokk">
            <h3>{round.round_clients.find((rc) => rc.id === p.round_client_id)?.client.name}</h3>
            <p>
              {value(p.started)} økter starta, {p.responses_total} svar sende
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
      </section>
    </>
  );
}

export function ProgressPage() {
  const rounds = useRounds();
  const [selected, setSelected] = useState('');
  const round =
    rounds.data?.find((r) => r.id === selected) ??
    rounds.data?.find((r) => r.status === 'open') ??
    rounds.data?.[0];
  const name = useQueryClient().getQueryData<{ name: string | null }>(['session'])?.name ?? null;
  return (
    <>
      <OverviewIntro name={name} round={round} />
      <ErrorMessage error={rounds.error} />
      <label className="velg">
        Runde{' '}
        <select
          aria-label="Runde"
          value={round?.id ?? ''}
          onChange={(e) => {
            setSelected(e.target.value);
          }}
        >
          {rounds.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {round ? (
        <ProgressRound key={round.id} round={round} />
      ) : (
        rounds.data && <p>Ingen rundar enno. Opprett ein under «Kundar og rundar».</p>
      )}
      <AuditLog />
    </>
  );
}
