// «Kundar» (2.17): the clients with their newest round, and a new client. A client opens its own
// page with its rounds over time, reports, findings and seminars; name and head count change there.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClientForm } from './clients-form.js';
import { Icon } from './icons.js';
import type { Client, Round } from './models.js';
import { follow, goTo } from './nav.js';
import { ErrorMessage, useClients, useRounds } from './queries.js';
import { ROUND_STATUS } from './runde-page.js';

/** The rounds of a client, newest first (the API lists rounds by creation, newest first). */
export const roundsOf = (rounds: Round[] | undefined, client: string) =>
  (rounds ?? []).filter((r) => r.round_clients.some((rc) => rc.client_id === client));

function KundeRad({ client, rounds }: { client: Client; rounds: Round[] }) {
  const to = `/admin/clients/${client.id}`;
  const newest = rounds[0];
  const rc = newest?.round_clients.find((c) => c.client_id === client.id);
  const [status, chip] = rc ? (ROUND_STATUS[newest!.status] ?? ['Avslutta', 'chip']) : ['', ''];
  const facts = [
    client.employee_count === null
      ? 'Tal tilsette er ikkje sett'
      : `${client.employee_count} tilsette`,
    rounds.length
      ? `${rounds.length} ${rounds.length === 1 ? 'runde' : 'rundar'}`
      : 'Ingen rundar enno',
  ];
  return (
    <a className="rad-lenkje" href={to} onClick={(e) => follow(e, to)}>
      <span className="rad-hovud">
        <b>{client.name}</b>
        <small>{facts.join(' · ')}</small>
      </span>
      <span className="rad-tal">
        {newest && <small>{newest.name}</small>}
        {status && <span className={chip}>{status}</span>}
      </span>
      <span className="rad-gaa" aria-hidden="true">
        <Icon name="chev" small />
      </span>
    </a>
  );
}

export function KundarPage() {
  const clients = useClients(),
    rounds = useRounds();
  const queries = useQueryClient();
  const [making, setMaking] = useState(false);
  const list = clients.data ?? [];
  return (
    <>
      <div className="bib-topp">
        <p className="bib-tal" role="status">
          {clients.data
            ? `${list.length} ${list.length === 1 ? 'kunde' : 'kundar'}`
            : 'Hentar kundar …'}
        </p>
        {!making && (
          <button type="button" className="btn primary" onClick={() => setMaking(true)}>
            <Icon name="pluss" small />
            Ny kunde
          </button>
        )}
      </div>
      {making && (
        <section className="del rom-ny smal" aria-labelledby="ny-kunde">
          <h2 id="ny-kunde">Ny kunde</h2>
          <ClientForm
            onSaved={(c) => {
              void queries
                .invalidateQueries({ queryKey: ['rounds'] })
                .then(() => goTo(`/admin/clients/${c.id}`));
            }}
          />
          <button type="button" className="btn" onClick={() => setMaking(false)}>
            Avbryt
          </button>
        </section>
      )}
      <ErrorMessage error={clients.error ?? rounds.error} />
      <section className="del rad-liste" aria-label="Alle kundar">
        {clients.data && list.length === 0 && (
          <p className="under">Ingen kundar enno. Legg til den første med «Ny kunde».</p>
        )}
        <ul>
          {list.map((c) => (
            <li key={c.id}>
              <KundeRad client={c} rounds={roundsOf(rounds.data, c.id)} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
