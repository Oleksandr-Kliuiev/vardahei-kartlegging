// The findings of the client's rounds (2.17), one round at a time — first the newest with
// findings, or the round a seminar's link asks for — and how each is followed up: open, taken up
// at a seminar (with a link to it) or done.
// A closed round keeps its findings (2.5), so the status is set once the round is closed; it lives
// beside the finding (3.1), and every change is in the log. This is the one place to change it.
import { useEffect, useRef, useState } from 'react';
import {
  keepPreviousData,
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
  seminar: { id: string; topic: string; starts_at: string } | null;
  changed_by: string | null;
  changed_at: string | null;
  /** Not in the round's current release any more, but still followed up from an older one; the
   * rule's text, null for a computed rule. */
  dropped?: { text: string | null };
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
  // Focus goes to the choice when the editor opens and back to «Endre status» when it closes, so a
  // keyboard or screen reader user is never left on the page body.
  const opener = useRef<HTMLButtonElement>(null),
    field = useRef<HTMLSelectElement>(null),
    back = useRef(false);
  useEffect(() => {
    if (editing) field.current?.focus();
    else if (back.current) {
      back.current = false;
      opener.current?.focus();
    }
  }, [editing]);
  const close = () => {
    back.current = true;
    setEditing(false);
  };
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
      close();
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
            ref={opener}
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
        <span
          className="oppfolging-endre"
          role="group"
          aria-label={`Ny status for funnet: ${text}`}
        >
          <select
            ref={field}
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
          <button type="button" className="btn sm" onClick={close}>
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

/** Findings that a new release of the round no longer has, but that an older one put into a
 * seminar: their status can still change here, so «I seminar» can end. */
function Utfalne({ rows, seminars }: { rows: FindingFollowUp[]; seminars: Seminar[] }) {
  return (
    <div className="kunde-funn-utfalne">
      <h3>Ikkje lenger med i resultatet</h3>
      <p className="forklaring">
        Ei ny utgåve av resultatet har ikkje desse funna lenger, men dei har framleis ein status.
      </p>
      <ul>
        {rows.map((r) => {
          const text = r.dropped?.text ?? 'Funn rekna ut frå tala i runden';
          return (
            <li key={r.id}>
              <p>{text}</p>
              <Oppfolging row={r} text={text} seminars={seminars} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type Result = Pick<UseQueryResult<Dashboard>, 'data' | 'dataUpdatedAt' | 'isPending' | 'error'>;

export function KundeFunn({
  client,
  asked = null,
  focus = false,
  rounds,
  ready,
  error,
  results,
  seminars,
}: {
  client: string;
  /** The round to show first (`?runde=` from a seminar's findings), if the client has answers in it. */
  asked?: string | null;
  /** Opened from a seminar's findings (`?runde=` or `?funn`): the card takes the focus. */
  focus?: boolean;
  /** The client's rounds with answers, newest first. */
  rounds: Round[];
  /** The list of rounds has loaded (until then no round says nothing). */
  ready: boolean;
  /** The list of rounds could not be read. */
  error: Error | null;
  results: ReadonlyMap<string, Result | undefined>;
  seminars: Seminar[];
}) {
  const [chosen, setChosen] = useState<string | null>(asked);
  const loading = rounds.some((r) => results.get(r.id)?.isPending ?? true);
  const count = (r: Round) => results.get(r.id)?.data?.findings.length;
  const first = loading ? undefined : (rounds.find((r) => (count(r) ?? 0) > 0) ?? rounds[0]);
  // The newest round with findings comes first and stays, also when a newer round gets answers;
  // after that the choice is the person's. A round asked for that the client has no answers in (an
  // old link) gives way to it the same way.
  useEffect(() => {
    if (first && (chosen === null || !rounds.some((r) => r.id === chosen))) setChosen(first.id);
  }, [chosen, first, rounds]);
  const round = rounds.find((r) => r.id === chosen) ?? first;
  const current = round ? results.get(round.id) : undefined;
  const found = current?.data;
  const closed = !!round && CLOSED.includes(round.status);
  // A closed round saves its findings for its release when the result is first read: the statuses
  // follow a new release, not every new read of a result (an open editor stays open).
  const releases = rounds
    .filter((r) => CLOSED.includes(r.status))
    .map((r) => results.get(r.id)?.data?.findings[0]?.release_id ?? '')
    .join(' ');
  const status = useQuery({
    queryKey: ['seminars', 'finding-status', client, releases],
    queryFn: () => api<{ rows: FindingFollowUp[] }>(`/api/admin/clients/${client}/finding-status`),
    enabled: closed && !!found,
    placeholderData: keepPreviousData,
  });
  const ofRound = (status.data?.rows ?? []).filter((r) => r.round === round?.id);
  const rows = new Map(ofRound.filter((r) => !r.dropped).map((r) => [r.rule_key, r]));
  const dropped = ofRound.filter((r) => r.dropped);
  // Opened from a seminar's findings: once the round's findings are there the card takes the focus,
  // so the page opens where the status is changed — unless the person has moved the focus meanwhile
  // (the search palette) or the round asked for is not the client's. On a phone the card is far
  // down and comes up, top first (a long card centred by the focus would hide its first findings);
  // a page that already shows it stays still.
  const card = useRef<HTMLElement>(null),
    arrived = useRef(false);
  useEffect(() => {
    const el = card.current;
    if (!focus || !found || !round || arrived.current || !el) return;
    arrived.current = true;
    if (asked !== null && round.id !== asked) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    el.focus({ preventScroll: true });
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ block: 'start' });
  }, [focus, asked, found, round]);
  return (
    <section
      ref={card}
      className="kort kunde-funn"
      aria-labelledby="kunde-funn"
      tabIndex={focus ? -1 : undefined}
    >
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
        {error ? (
          <ErrorMessage error={error} />
        ) : ready && rounds.length === 0 ? (
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
            {closed && dropped.length > 0 && <Utfalne rows={dropped} seminars={seminars} />}
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
