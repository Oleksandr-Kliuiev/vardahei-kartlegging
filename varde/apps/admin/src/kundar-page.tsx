// «Kundar» (2.17): the clients with their newest round, and a new client. A client opens its own
// page with its rounds over time, reports, findings and seminars; name and head count change there.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClientForm } from './clients-form.js';
import { Icon } from './icons.js';
import { LeggTilFleire } from './kundar-bolk.js';
import { Merkelappar, tagsOf } from './merkelappar.js';
import { flatNorsk } from './norsk.js';
import type { Client, Round } from './models.js';
import { follow, goTo } from './nav.js';
import { ErrorMessage, useClients, useRounds } from './queries.js';
import { ROUND_STATUS } from './runde-page.js';
import './kundar.css';

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
        <Merkelappar tags={client.tags} />
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
  const [making, setMaking] = useState<'ein' | 'fleire' | null>(null);
  const [find, setFind] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [arkiv, setArkiv] = useState(false);
  const everyone = clients.data ?? [];
  // Archived clients (wave B) are kept, but out of the way: they show only when asked for.
  const all = everyone.filter((c) => (c.archived_at !== null) === arkiv);
  const arkiverte = everyone.filter((c) => c.archived_at !== null).length;
  const tags = tagsOf(all);
  const words = flatNorsk(find.trim());
  // What the eye should land on: the clients that match the search and the chosen tag.
  const list = all.filter(
    (c) => (tag === null || c.tags.includes(tag)) && flatNorsk(c.name).includes(words),
  );
  const filtered = words !== '' || tag !== null;
  return (
    <>
      <div className="bib-topp">
        <p className="bib-tal" role="status">
          {!clients.data
            ? 'Hentar kundar …'
            : filtered
              ? `${list.length} av ${all.length} ${all.length === 1 ? 'kunde' : 'kundar'}`
              : `${all.length} ${all.length === 1 ? 'kunde' : 'kundar'}`}
        </p>
        {making === null && (
          <div className="bib-topp-handlingar">
            <button type="button" className="btn" onClick={() => setMaking('fleire')}>
              <Icon name="pluss" small />
              Legg til fleire
            </button>
            <button type="button" className="btn primary" onClick={() => setMaking('ein')}>
              <Icon name="pluss" small />
              Ny kunde
            </button>
          </div>
        )}
      </div>
      {(all.length > 1 || arkiverte > 0) && (
        <div className="kundar-verktoy">
          <input
            className="input kundar-sok"
            type="search"
            placeholder="Finn kunde"
            aria-label="Finn kunde"
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
          {tags.length > 0 && (
            <div className="seg kval-merke" role="group" aria-label="Merkelappar">
              <button type="button" aria-pressed={tag === null} onClick={() => setTag(null)}>
                Alle
              </button>
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tag === t}
                  onClick={() => setTag(tag === t ? null : t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {arkiverte > 0 && (
            <div className="seg kval-merke" role="group" aria-label="Arkiv">
              <button
                type="button"
                aria-pressed={!arkiv}
                onClick={() => {
                  setArkiv(false);
                  setTag(null);
                }}
              >
                Aktive
              </button>
              <button
                type="button"
                aria-pressed={arkiv}
                onClick={() => {
                  setArkiv(true);
                  setTag(null);
                }}
              >
                Arkiverte ({arkiverte})
              </button>
            </div>
          )}
        </div>
      )}
      {making === 'ein' && (
        <section className="del rom-ny smal" aria-labelledby="ny-kunde">
          <h2 id="ny-kunde">Ny kunde</h2>
          <ClientForm
            onSaved={(c) => {
              void queries
                .invalidateQueries({ queryKey: ['rounds'] })
                .then(() => goTo(`/admin/clients/${c.id}`));
            }}
          />
          <button type="button" className="btn" onClick={() => setMaking(null)}>
            Avbryt
          </button>
        </section>
      )}
      {making === 'fleire' && <LeggTilFleire known={all} onClose={() => setMaking(null)} />}
      <ErrorMessage error={clients.error ?? rounds.error} />
      <section className="del rad-liste" aria-label="Alle kundar">
        {clients.data && list.length === 0 && (
          <p className="under">
            {all.length > 0
              ? 'Ingen kundar passar. Prøv eit anna ord, eller vel «Alle».'
              : arkiv
                ? 'Ingen arkiverte kundar.'
                : 'Ingen kundar enno. Legg til den første med «Ny kunde».'}
          </p>
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
