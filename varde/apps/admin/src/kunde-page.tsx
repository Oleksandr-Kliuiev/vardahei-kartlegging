// The page of one client (2.17): its rounds over time with the zone of each, the report of each
// closed round, the findings of its rounds and how each is followed up, its seminars and its
// contacts — so the client is chosen once, by opening it. The numbers come from the same aggregate
// API as «Resultat»; the contacts only on request, through privacy.
import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { ClientForm } from './clients-form.js';
import { Zone } from './dashboard-aggregate.js';
import { type Dashboard, numberText } from './dashboard-models.js';
import { dashboardQuery } from './dashboard-page.js';
import { Icon } from './icons.js';
import { roundsOf } from './kundar-page.js';
import { KundeFunn } from './kunde-funn.js';
import { KundeKontaktar } from './kunde-kontaktar.js';
import type { Round } from './models.js';
import { follow, useTitle } from './nav.js';
import { ErrorMessage, useClients, useRounds } from './queries.js';
import { longDate } from './overview.js';
import { ROUND_STATUS, roundWhen } from './runde-page.js';
import { type SeminarList, shortDate } from './seminar-models.js';
import './dashboard.css';

const query = (round: string, client: string) => new URLSearchParams({ round, client }).toString();

function Lenkje({ to, children }: { to: string; children: string }) {
  return (
    <a className="lenkje" href={to} onClick={(e) => follow(e, to)}>
      {children}
      <Icon name="pil" small />
    </a>
  );
}

export function KundePage({ id }: { id: string }) {
  const clients = useClients(),
    rounds = useRounds();
  const seminars = useQuery({
    queryKey: ['seminars', 'list'],
    queryFn: () => api<SeminarList>('/api/admin/seminars'),
  });
  const client = clients.data?.find((c) => c.id === id);
  useTitle(client?.name);
  const mine = roundsOf(rounds.data, id);
  const answered = mine.filter((r) => r.has_data);
  const results = useQueries({
    queries: answered.map((r) => dashboardQuery(query(r.id, id))),
  });
  const result = new Map(answered.map((r, i) => [r.id, results[i]]));
  const [editing, setEditing] = useState(false);
  const back = (
    <a className="rom-tilbake" href="/admin/clients" onClick={(e) => follow(e, '/admin/clients')}>
      <Icon name="tilbake" small />
      Alle kundar
    </a>
  );
  if (!client)
    return (
      <div className="rom-topp">
        {back}
        <ErrorMessage error={clients.error} />
        <p role="status">
          {clients.data && !clients.isFetching ? 'Kunden finst ikkje.' : 'Hentar kunden …'}
        </p>
      </div>
    );
  const own = (seminars.data?.seminars ?? []).filter((s) => s.clients.some((c) => c.id === id));
  return (
    <>
      <div className="rom-topp">
        {back}
        <div className="sidetittel">
          <div>
            <h1>{client.name}</h1>
            <p>
              {client.employee_count === null
                ? 'Tal tilsette er ikkje sett'
                : `${client.employee_count} tilsette`}
              {' · '}
              {mine.length} {mine.length === 1 ? 'runde' : 'rundar'}
            </p>
          </div>
          {!editing && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Endre namn og tal tilsette
            </button>
          )}
        </div>
      </div>
      {editing && (
        <section className="del smal rom-ny" aria-label={`Endre ${client.name}`}>
          <ClientForm
            key={`${client.name}-${client.employee_count}`}
            client={client}
            onSaved={() => setEditing(false)}
          />
          <p className="forklaring">
            Talet på tilsette blir brukt i nye rundar. Rundar som finst, held på sitt eige tal.
          </p>
          <button type="button" className="btn" onClick={() => setEditing(false)}>
            Avbryt
          </button>
        </section>
      )}
      <div className="flate">
        <div className="s7 rom-side">
          <section className="kort" aria-labelledby="kunde-tid">
            <div className="kort-hovud">
              <h2 id="kunde-tid">Over tid</h2>
            </div>
            <div className="kort-innhald">
              {rounds.data && mine.length === 0 && (
                <p className="under">Kunden har ikkje vore med i ei runde enno.</p>
              )}
              <ol className="tidslinje">
                {[...mine].reverse().map((r) => (
                  <Steg key={r.id} round={r} client={id} data={result.get(r.id)?.data} />
                ))}
              </ol>
            </div>
          </section>
          <KundeKontaktar key={client.id} client={client} />
        </div>
        <div className="s5 rom-side">
          <KundeFunn
            key={client.id}
            client={id}
            rounds={answered}
            ready={!!rounds.data}
            results={result}
            seminars={own}
          />
          <section className="kort" aria-labelledby="kunde-seminar">
            <div className="kort-hovud">
              <h2 id="kunde-seminar">Seminar</h2>
            </div>
            <div className="kort-innhald">
              {seminars.data && own.length === 0 && (
                <p className="under">Kunden har ikkje vore med på seminar enno.</p>
              )}
              <ul className="rom-liste">
                {own.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`/admin/seminars/${s.id}`}
                      onClick={(e) => follow(e, `/admin/seminars/${s.id}`)}
                    >
                      {s.topic_nn}
                    </a>
                    <small>
                      {shortDate(s.starts_at)} ·{' '}
                      {s.status === 'planned' ? 'Planlagt' : 'Gjennomført'}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/** One round on the client's timeline: state, zone and number of answers, and the report. */
function Steg({
  round,
  client,
  data,
}: {
  round: Round;
  client: string;
  data: Dashboard | undefined;
}) {
  const rc = round.round_clients.find((c) => c.client_id === client);
  const [status, chip] = ROUND_STATUS[round.status] ?? ['Avslutta', 'chip'];
  const zones = data?.zones;
  const report = `/admin/rounds/${round.id}/rapportar/${rc?.id ?? ''}`;
  return (
    <li>
      <span className="tid-prikk" aria-hidden="true" />
      <div className="tid-innhald">
        <span className="tid-hovud">
          <a
            href={`/admin/rounds/${round.id}`}
            onClick={(e) => follow(e, `/admin/rounds/${round.id}`)}
          >
            {round.name}
          </a>
          <span className={chip}>{status}</span>
        </span>
        <small>{roundWhen(round)}</small>
        {!round.has_data ? (
          <small>Ingen svar enno.</small>
        ) : zones ? (
          <span className="tid-tal">
            <Zone zone={zones.zone} />
            <small>
              snitt {numberText(zones.mean)} · {zones.n ?? '–'} svar
            </small>
          </span>
        ) : null}
        {rc?.released && ['closed', 'archived'].includes(round.status) && (
          <span className="tid-tal">
            <Lenkje to={report}>Rapporten til kunden</Lenkje>
            <small>
              {rc.report_sent_at
                ? `Sendt ${longDate(new Date(rc.report_sent_at))}`
                : 'Ikkje merkt som sendt'}
            </small>
          </span>
        )}
      </div>
    </li>
  );
}
