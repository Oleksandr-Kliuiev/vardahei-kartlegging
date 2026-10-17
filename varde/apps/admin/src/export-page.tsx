import { HandoverForm } from './handover-form.js';
import { useState } from 'react';
import { useRounds, useClients } from './queries.js';

export function ExportPage() {
  const rounds = useRounds(),
    clients = useClients();
  const [round, setRound] = useState(''),
    [client, setClient] = useState('');
  const q = new URLSearchParams({ round, ...(client ? { client } : {}) }).toString();
  const closed = ['closed', 'archived'].includes(
    rounds.data?.find((r) => r.id === round)?.status ?? '',
  );
  return (
    <section className="del smal">
      <p>Samla tal til kunden, svarrader til Vardahei IT.</p>
      <label>
        Runde{' '}
        <select aria-label="Runde" value={round} onChange={(e) => setRound(e.target.value)}>
          <option value="">Vel runde</option>
          {rounds.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Kunde{' '}
        <select aria-label="Kunde" value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">Alle</option>
          {clients.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {round && (
        <div className="handlingar">
          {client && <a href={'/api/admin/exports/client.csv?' + q}>Samla CSV til kunden</a>}
          <a href={'/api/admin/exports/rows.csv?' + q}>Svarrader (CSV)</a>
          <a href={'/api/admin/exports/analyse.csv?round=' + round}>Master_Analyse</a>
          <a href={'/api/admin/exports/analyse-personar.csv?round=' + round}>
            Svar per tilsett (CSV)
          </a>
        </div>
      )}
      {round && closed && (
        <div className="arkiv">
          <a className="knapp" href={'/api/admin/exports/archive.json?round=' + round} download>
            Last ned arkiv
          </a>
          <p className="under">
            Arkivet har dei publiserte samla tala for heile runden, med definisjonane bak dei. Ingen
            svar, initialar eller fritekst. Det kan lesast inn att i ein tom database.
          </p>
        </div>
      )}
      {client && <HandoverForm key={client} client={client} />}
    </section>
  );
}
