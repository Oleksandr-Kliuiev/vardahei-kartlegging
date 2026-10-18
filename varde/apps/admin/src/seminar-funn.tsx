// «Funn seminaret tek opp» on the page of one seminar (2.17): the findings whose status points to
// the seminar, per client and round, with the level, numbers and text of the client's result (the
// same cache as the client page) and the status chip of the client page. The status is changed
// only on the client page, so each client links there, opened on the round of its findings.
import { Fragment } from 'react';
import { type UseQueryResult, useQueries } from '@tanstack/react-query';
import { Niva } from './dashboard-aggregate.js';
import type { Dashboard } from './dashboard-models.js';
import { dashboardQuery } from './dashboard-page.js';
import { Icon } from './icons.js';
import { FOLLOW_UP } from './kunde-funn.js';
import { follow } from './nav.js';
import { ErrorMessage, useClients, useRounds } from './queries.js';
import type { SeminarDetail, SeminarFinding } from './seminar-models.js';
import './dashboard.css';

export interface FunnGroup {
  round: string;
  client: string | null;
  findings: SeminarFinding[];
}

/** One finding per rule of a round and client — the newest status, as the client page shows it —
 * grouped by client and round. */
export function groupFindings(findings: readonly SeminarFinding[]): FunnGroup[] {
  const newest = new Map<string, SeminarFinding>();
  for (const f of findings) {
    const key = `${f.round} ${f.client ?? ''} ${f.rule_key}`;
    const seen = newest.get(key);
    if (!seen || seen.changed_at <= f.changed_at) newest.set(key, f);
  }
  const groups = new Map<string, FunnGroup>();
  for (const f of newest.values()) {
    const key = `${f.round} ${f.client ?? ''}`;
    const group = groups.get(key) ?? { round: f.round, client: f.client, findings: [] };
    group.findings.push(f);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Where the status of a group is changed: the client page, on the round of the findings. A finding
 * of all the clients of a round has no client page; its result is on the page of the round. */
export function statusPage(g: Pick<FunnGroup, 'round' | 'client'>) {
  return g.client
    ? `/admin/clients/${g.client}?${new URLSearchParams({ runde: g.round }).toString()}`
    : `/admin/rounds/${g.round}/resultat`;
}

/** The texts come from the client's result of the round, read as the client page reads it. */
const resultOf = (g: FunnGroup) =>
  dashboardQuery(
    new URLSearchParams({ round: g.round, ...(g.client ? { client: g.client } : {}) }).toString(),
  );

type Result = Pick<UseQueryResult<Dashboard>, 'data' | 'error'>;

function Gruppe({
  group,
  client,
  round,
  result,
}: {
  group: FunnGroup;
  client: string;
  round: string;
  result: Result | undefined;
}) {
  const found = result?.data?.findings ?? [];
  // The order of the result: the highest level first.
  const at = (f: SeminarFinding) => {
    const i = found.findIndex((x) => x.key === f.rule_key);
    return i < 0 ? found.length : i;
  };
  const to = statusPage(group);
  const link = group.client ? `Endre status hos ${client}` : 'Sjå resultatet for runden';
  return (
    <div className="sem-funn-gruppe">
      <div className="sem-funn-hovud">
        <h3>
          {client} <small>{round}</small>
        </h3>
        {/* One client with two rounds has the same words twice: the round in the name tells them apart. */}
        <a
          className="lenkje"
          href={to}
          aria-label={`${link}, ${round}`}
          onClick={(e) => follow(e, to)}
        >
          {link}
          <Icon name="pil" small />
        </a>
      </div>
      {result?.error ? (
        <ErrorMessage error={result.error} />
      ) : !result?.data ? (
        <p role="status">Hentar funna …</p>
      ) : (
        <ul className="funn">
          {[...group.findings]
            .sort((a, b) => at(a) - at(b))
            .map((f) => {
              const shown = found.find((x) => x.key === f.rule_key);
              const [label, chip] = FOLLOW_UP[f.status] ?? FOLLOW_UP.open!;
              return (
                <li key={f.id}>
                  {shown && <Niva finding={shown} />}
                  <div className="sem-funn-tekst">
                    {shown ? (
                      <>
                        <b>{shown.tal}</b> {shown.text}
                      </>
                    ) : (
                      'Funnet er ikkje med i resultatet for runden no.'
                    )}{' '}
                    <span className={chip}>{label}</span>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

/** No findings yet: where they are chosen, with a link to each client of the seminar. */
function Tom({ seminar }: { seminar: SeminarDetail }) {
  const list = seminar.clients;
  return (
    <p className="under sem-funn-tom">
      Seminaret tek ikkje opp nokon funn enno.{' '}
      {list.length ? (
        <>
          Vel «I seminar» for eit funn på sida til kunden:{' '}
          {list.map((c, i) => (
            <Fragment key={c.id}>
              {i > 0 && (i === list.length - 1 ? ' og ' : ', ')}
              <a
                href={`/admin/clients/${c.id}`}
                onClick={(e) => follow(e, `/admin/clients/${c.id}`)}
              >
                {c.name}
              </a>
            </Fragment>
          ))}
          .
        </>
      ) : (
        'Funna kjem frå kundane: legg til kundar med «Endre» først.'
      )}
    </p>
  );
}

/** The groups, read only when there is something to show: names of clients and rounds, results. */
function Liste({ seminar, groups }: { seminar: SeminarDetail; groups: FunnGroup[] }) {
  const clients = useClients(),
    rounds = useRounds();
  const results = useQueries({ queries: groups.map(resultOf) });
  const all = rounds.data;
  const clientName = (id: string | null) =>
    id === null
      ? 'Alle kundar'
      : (clients.data?.find((c) => c.id === id)?.name ??
        seminar.clients.find((c) => c.id === id)?.name ??
        'Ukjend kunde');
  const roundName = (id: string) => all?.find((r) => r.id === id)?.name ?? 'Ukjend runde';
  // Clients by name; per client the newest round first, as the list of rounds comes.
  const order = (id: string) => {
    const i = all?.findIndex((r) => r.id === id) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const shown = groups
    .map((group, i) => ({ group, result: results[i] }))
    .sort(
      (a, b) =>
        clientName(a.group.client).localeCompare(clientName(b.group.client), 'nb') ||
        order(a.group.round) - order(b.group.round),
    );
  const error = clients.error ?? rounds.error;
  if (error) return <ErrorMessage error={error} />;
  if (!clients.data || !all) return <p role="status">Hentar funna …</p>;
  return shown.map(({ group, result }) => (
    <Gruppe
      key={`${group.round} ${group.client ?? ''}`}
      group={group}
      client={clientName(group.client)}
      round={roundName(group.round)}
      result={result}
    />
  ));
}

export function SeminarFunn({ seminar }: { seminar: SeminarDetail }) {
  const groups = groupFindings(seminar.findings);
  const count = groups.reduce((n, g) => n + g.findings.length, 0);
  return (
    <section className="kort sem-funn" aria-labelledby="sem-funn-tittel">
      <div className="kort-hovud">
        <h2 id="sem-funn-tittel">Funn seminaret tek opp</h2>
        {count > 0 && <p>{count} funn</p>}
      </div>
      <div className="kort-innhald">
        {count === 0 ? <Tom seminar={seminar} /> : <Liste seminar={seminar} groups={groups} />}
      </div>
    </section>
  );
}
