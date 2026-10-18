// The findings of the client's rounds (2.17), one round at a time — first the newest with
// findings — and how each is followed up: open, taken up at a seminar (with a link to it) or done.
// A closed round keeps its findings (2.5), so the status is set once the round is closed; it lives
// beside the finding (3.1), and every change is in the log. This is the one place to change it.
import { useState } from 'react';
import { type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { Findings } from './dashboard-aggregate.js';
import type { Dashboard } from './dashboard-models.js';
import { Icon } from './icons.js';
import type { Round } from './models.js';
import { follow } from './nav.js';
import { ErrorMessage } from './queries.js';
import { type Seminar, shortDate } from './seminar-models.js';
import { useToast } from './shell.js';

export interface FindingFollowUp {
  /** The saved finding a new status goes to. */
  id: string;
  round: string;
  rule_key: string;
  status: 'open' | 'in_seminar' | 'closed';
  seminar: { id: string; topic: string; starts_at: string; held: boolean } | null;
  changed_by: string | null;
  changed_at: string | null;
}

export const FOLLOW_UP: Record<string, readonly [string, string]> = {
  open: ['Open', 'chip'],
  in_seminar: ['I seminar', 'chip accent'],
  closed: ['Ferdig', 'chip ok'],
};
const CLOSED = ['closed', 'archived'];

/** The value of the choice: `open`, `closed` or `seminar:<id>`. */
const choiceOf = (row: FindingFollowUp) =>
  row.status === 'in_seminar' && row.seminar ? `seminar:${row.seminar.id}` : row.status;

/** The body of `PUT /api/admin/findings/:id/status`; a done finding keeps its seminar. */
export function statusBody(choice: string, row: FindingFollowUp) {
  if (choice.startsWith('seminar:')) return { status: 'in_seminar', seminar: choice.slice(8) };
  if (choice === 'closed')
    return row.seminar ? { status: 'closed', seminar: row.seminar.id } : { status: 'closed' };
  return { status: 'open' };
}

function Oppfolging({
  row,
  text,
  seminars,
}: {
  row: FindingFollowUp;
  text: string;
  seminars: Seminar[];
}) {
  const queries = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(choiceOf(row));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [label, chip] = FOLLOW_UP[row.status] ?? FOLLOW_UP.open!;
  // The client's seminars, and the one the finding is taken up at even if the client left it.
  const options = [
    ...seminars.map((s) => ({ id: s.id, topic: s.topic_nn, starts_at: s.starts_at })),
    ...(row.seminar && !seminars.some((s) => s.id === row.seminar!.id) ? [row.seminar] : []),
  ];
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/admin/findings/${row.id}/status`, 'PUT', statusBody(choice, row));
      await queries.invalidateQueries({ queryKey: ['seminars'] });
      setEditing(false);
      toast('Status for funnet er lagra.');
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="oppfolging">
      <span className="oppfolging-status">
        <span className={chip}>{label}</span>
        {row.seminar && (
          <a
            href={`/admin/seminars/${row.seminar.id}`}
            onClick={(e) => follow(e, `/admin/seminars/${row.seminar!.id}`)}
          >
            {row.seminar.topic} · {shortDate(row.seminar.starts_at)}
          </a>
        )}
        {row.changed_by && row.changed_at && (
          <small>
            Endra av {row.changed_by} {shortDate(row.changed_at)}
          </small>
        )}
        {!editing && (
          <button
            type="button"
            className="btn sm ghost"
            aria-label={`Endre status for funnet: ${text}`}
            onClick={() => {
              setChoice(choiceOf(row));
              setEditing(true);
            }}
          >
            Endre status
          </button>
        )}
      </span>
      {editing && (
        <span className="oppfolging-endre">
          <select
            aria-label={`Status for funnet: ${text}`}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="open">Open</option>
            {options.map((s) => (
              <option key={s.id} value={`seminar:${s.id}`}>
                I seminar: {s.topic} ({shortDate(s.starts_at)})
              </option>
            ))}
            <option value="closed">Ferdig</option>
          </select>
          <button
            type="button"
            className="btn sm primary"
            disabled={busy || choice === choiceOf(row)}
            onClick={() => void save()}
          >
            Lagre
          </button>
          <button type="button" className="btn sm" onClick={() => setEditing(false)}>
            Avbryt
          </button>
          {options.length === 0 && (
            <small>Kunden er ikkje med på noko seminar. Lag seminaret under «Seminar» først.</small>
          )}
        </span>
      )}
      <ErrorMessage error={error} />
    </div>
  );
}

type Result = Pick<UseQueryResult<Dashboard>, 'data' | 'dataUpdatedAt' | 'isPending' | 'error'>;

export function KundeFunn({
  client,
  rounds,
  ready,
  results,
  seminars,
}: {
  client: string;
  /** The client's rounds with answers, newest first. */
  rounds: Round[];
  /** The list of rounds has loaded (until then no round says nothing). */
  ready: boolean;
  results: ReadonlyMap<string, Result | undefined>;
  seminars: Seminar[];
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const loading = rounds.some((r) => results.get(r.id)?.isPending ?? true);
  const count = (r: Round) => results.get(r.id)?.data?.findings.length;
  // The newest round with findings comes first; after that the choice is the person's.
  const round =
    rounds.find((r) => r.id === chosen) ??
    (loading ? undefined : (rounds.find((r) => (count(r) ?? 0) > 0) ?? rounds[0]));
  const current = round ? results.get(round.id) : undefined;
  const found = current?.data;
  const closed = !!round && CLOSED.includes(round.status);
  // A closed round saves its findings when its result is read: the statuses follow those reads.
  const read = rounds
    .filter((r) => CLOSED.includes(r.status))
    .map((r) => results.get(r.id)?.dataUpdatedAt ?? 0);
  const status = useQuery({
    queryKey: ['seminars', 'finding-status', client, Math.max(0, ...read)],
    queryFn: () => api<{ rows: FindingFollowUp[] }>(`/api/admin/clients/${client}/finding-status`),
    enabled: closed && !!found,
  });
  const rows = new Map(
    (status.data?.rows ?? []).filter((r) => r.round === round?.id).map((r) => [r.rule_key, r]),
  );
  return (
    <section className="kort" aria-labelledby="kunde-funn">
      <div className="kort-hovud">
        <h2 id="kunde-funn">Funn</h2>
        {round && rounds.length > 1 ? (
          <select
            className="kunde-funn-runde"
            aria-label="Vis funn frå runde"
            value={round.id}
            onChange={(e) => setChosen(e.target.value)}
          >
            {rounds.map((r) => {
              const n = count(r);
              return (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {n === undefined ? '' : n === 0 ? ' · ingen funn' : ` · ${n} funn`}
                </option>
              );
            })}
          </select>
        ) : (
          round && <p>{round.name}</p>
        )}
      </div>
      <div className="kort-innhald">
        {ready && rounds.length === 0 ? (
          <p className="under">Funna kjem når kunden har svar i ei runde.</p>
        ) : !round || !found ? (
          current?.error ? (
            <ErrorMessage error={current.error} />
          ) : (
            <p role="status">Hentar funna …</p>
          )
        ) : (
          <>
            {!closed && found.findings.length > 0 && (
              <p className="forklaring kunde-funn-open">
                Runden er open. Status på funna kan du setje når runden er avslutta.
              </p>
            )}
            {found.findings.length ? (
              <Findings
                findings={found.findings}
                follow={(f) => {
                  const row = rows.get(f.key);
                  return row ? (
                    <Oppfolging row={row} text={`${f.tal} ${f.text}`} seminars={seminars} />
                  ) : null;
                }}
              />
            ) : (
              <p className="under">Ingen tydelege funn i denne runden.</p>
            )}
            <ErrorMessage error={status.error} />
            <a
              className="lenkje"
              href={`/admin/rounds/${round.id}/resultat`}
              onClick={(e) => follow(e, `/admin/rounds/${round.id}/resultat`)}
            >
              Sjå heile resultatet
              <Icon name="pil" small />
            </a>
          </>
        )}
      </div>
    </section>
  );
}
