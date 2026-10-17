// The journal (2.17): who did what and when, with names instead of ids. «Personvern › Logg» shows
// everything with a filter by area; the page of a round shows the entries of that round.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { auditTarget, auditWhat, auditWhen, auditWho } from './audit-labels.js';
import type { Audit } from './models.js';
import { ErrorMessage, useClients, useRounds } from './queries.js';
import { Seg } from './widgets.js';

type Area = 'alle' | 'rundar' | 'skjema' | 'seminar' | 'personvern';
const AREAS: readonly (readonly [Area, string])[] = [
  ['alle', 'Alle'],
  ['rundar', 'Rundar og kundar'],
  ['skjema', 'Skjema og funn'],
  ['seminar', 'Seminar'],
  ['personvern', 'Personvern'],
];
/** The area of an entry by what happened: reading and deleting data is «Personvern». */
export function areaOf(what: string): Exclude<Area, 'alle'> {
  if (/^(rounds|clients)\./.test(what)) return 'rundar';
  if (/^(surveys|findings|settings)\./.test(what)) return 'skjema';
  if (what.startsWith('seminars.')) return 'seminar';
  return 'personvern';
}

/** Under the `rounds` key, so every round action refreshes it (useAction). */
const auditQuery = (limit: number, round?: string) => ({
  queryKey: ['rounds', 'audit', round ?? 'alle', limit],
  queryFn: () => api<Audit[]>(`/api/admin/audit?limit=${limit}${round ? `&round=${round}` : ''}`),
});

export function Logg({
  title = 'Siste hendingar',
  round,
  filter = false,
}: {
  title?: string;
  /** Only the entries of this round and its clients. */
  round?: string;
  /** Choose an area and show up to 200 entries. */
  filter?: boolean;
}) {
  const [limit, setLimit] = useState(40);
  const [area, setArea] = useState<Area>('alle');
  const audit = useQuery(auditQuery(limit, round)),
    rounds = useRounds(),
    clients = useClients();
  const rows = (audit.data ?? []).filter((r) => area === 'alle' || areaOf(r.what) === area);
  const names = { rounds: rounds.data ?? [], clients: clients.data ?? [] };
  return (
    <section className={filter ? 'del logg-del heil' : 'del logg-del'} aria-label={title}>
      <div className="logg-topp">
        <h2>{title}</h2>
        {filter && <Seg label="Område" value={area} options={AREAS} onChange={setArea} />}
      </div>
      <ErrorMessage error={audit.error} />
      <ol className="logg">
        {rows.map((row, i) => (
          <li key={`${row.at}-${i}`}>
            <time dateTime={row.at}>{auditWhen(row.at)}</time>{' '}
            <strong>{auditWho(row.who, row.who_name)}</strong> {auditWhat(row.what)}{' '}
            <small>{auditTarget(row.target, names)}</small>
          </li>
        ))}
      </ol>
      {audit.data && rows.length === 0 && (
        <p className="under">
          {audit.data.length ? 'Ingenting i dette området.' : 'Ingenting har skjedd enno.'}
        </p>
      )}
      {filter && audit.data?.length === limit && limit < 200 && (
        <button type="button" className="btn sm" onClick={() => setLimit(200)}>
          Vis fleire hendingar
        </button>
      )}
    </section>
  );
}
