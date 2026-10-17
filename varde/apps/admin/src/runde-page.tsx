// The page of one round (2.17): everything about it in one place — «Framdrift», «Utsending»,
// «Resultat» and «Rapportar» — so the round is chosen once, by opening it, never again per section.
import { useState, type FormEvent } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { mutate } from './api.js';
import { DashboardRound } from './dashboard-page.js';
import { Icon } from './icons.js';
import { Logg } from './logg.js';
import type { Client, Round } from './models.js';
import { follow, useTitle } from './nav.js';
import { longDate } from './overview.js';
import { progressQuery, ProgressRound } from './progress-page.js';
import { ErrorMessage, useAction, useClients, useRounds, useVersions } from './queries.js';
import { RoundReports } from './report-page.js';
import { RoundClientCard } from './round-client.js';
import { Faner, HoldButton } from './widgets.js';
import './dashboard.css';

const TABS = [
  ['framdrift', 'Framdrift'],
  ['utsending', 'Utsending'],
  ['resultat', 'Resultat'],
  ['rapportar', 'Rapportar'],
] as const;
type Tab = (typeof TABS)[number][0];
export const ROUND_STATUS: Record<string, [string, string]> = {
  draft: ['Ikkje opna', 'chip'],
  open: ['Open', 'chip ok'],
  closed: ['Avslutta', 'chip warn'],
  archived: ['Arkivert', 'chip'],
};
const finished = (r: Round) => !['draft', 'open'].includes(r.status);
/** The view that matters most now: sending out before it opens, progress while open, results after. */
const firstTab = (r: Round): Tab =>
  r.status === 'draft' ? 'utsending' : r.status === 'open' ? 'framdrift' : 'resultat';

/** «Opna 12. oktober», «Avslutta 3. oktober» or «Oppretta 1. oktober». */
export function roundWhen(r: Round): string {
  const at = (iso: string | null | undefined, text: string) =>
    iso ? `${text} ${longDate(new Date(iso))}` : '';
  return finished(r)
    ? at(r.closed_at, 'Avslutta') || at(r.opened_at, 'Opna')
    : r.status === 'open'
      ? at(r.opened_at, 'Opna')
      : at(r.created_at, 'Oppretta');
}

export function RundePage({
  id,
  tab,
  rc,
  search,
}: {
  id: string;
  tab: string | undefined;
  rc: string | undefined;
  search: string;
}) {
  const rounds = useRounds(),
    versions = useVersions();
  const round = rounds.data?.find((r) => r.id === id);
  const fane: Tab = TABS.find(([k]) => k === tab)?.[0] ?? (round ? firstTab(round) : 'framdrift');
  const label = TABS.find(([k]) => k === fane)![1];
  useTitle(round ? `${label} · ${round.name}` : undefined);
  const back = (
    <a className="rom-tilbake" href="/admin/rounds" onClick={(e) => follow(e, '/admin/rounds')}>
      <Icon name="tilbake" small />
      Alle rundar
    </a>
  );
  if (!round)
    return (
      <div className="rom-topp">
        {back}
        <ErrorMessage error={rounds.error} />
        <p role="status">
          {rounds.data && !rounds.isFetching ? 'Runden finst ikkje.' : 'Hentar runden …'}
        </p>
      </div>
    );
  const version = versions.data?.find((v) => v.id === round.template_version_id);
  const [status, chip] = ROUND_STATUS[round.status] ?? ['Avslutta', 'chip'];
  const base = `/admin/rounds/${round.id}`;
  const n = round.round_clients.length;
  const facts = [
    version ? `Skjema: ${version.title ?? version.template.key} · ${version.label}` : '',
    roundWhen(round),
    n ? `${n} ${n === 1 ? 'kunde' : 'kundar'}` : 'ingen kundar enno',
  ].filter(Boolean);
  return (
    <>
      <div className="rom-topp">
        {back}
        <div className="sidetittel">
          <div>
            <h1>{round.name}</h1>
            <p>{facts.join(' · ')}</p>
          </div>
          <span className="handlingar">
            {round.type === 'post_seminar' && <span className="chip accent">Etter seminar</span>}
            <span className={chip}>{status}</span>
          </span>
        </div>
      </div>
      <Faner
        label="Runden"
        items={TABS.map(([k, text]) => [`${base}/${k}`, text] as const)}
        current={`${base}/${fane}`}
      />
      {fane === 'framdrift' &&
        (round.status === 'draft' ? (
          <section className="del">
            <h2>Framdrift i {round.name}</h2>
            <p className="under">
              Runden er ikkje opna enno. Opne kundane under «Utsending», så kjem framdrifta her.
            </p>
          </section>
        ) : (
          <ProgressRound round={round} />
        ))}
      {fane === 'utsending' && (
        <Utsending round={round} asked={new URLSearchParams(search).get('kunde')} />
      )}
      {fane === 'resultat' &&
        (round.status === 'draft' ? (
          <section className="del">
            <h2>Resultat</h2>
            <p className="under">
              Runden er ikkje opna enno. Resultatet kjem her når dei første har svart.
            </p>
          </section>
        ) : (
          <DashboardRound key={round.id} round={round.id} clients={round.round_clients} />
        ))}
      {fane === 'rapportar' && <RoundReports round={round} rc={rc} />}
    </>
  );
}

function AddClient({ round, clients }: { round: Round; clients: Client[] }) {
  const [selected, setSelected] = useState('');
  const action = useAction();
  const available = clients.filter((c) => !round.round_clients.some((rc) => rc.client_id === c.id));
  if (!available.length) return null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    action.mutate(
      () =>
        mutate(`/api/admin/rounds/${round.id}/clients`, 'POST', {
          client_id: form.get('client'),
          deadline: form.get('deadline'),
        }),
      { onSuccess: () => setSelected('') },
    );
  }
  return (
    <form className="knappar" onSubmit={submit} aria-label="Legg til kunde i runden">
      <label>
        Kunde{' '}
        <select
          required
          aria-label="Kunde"
          name="client"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Vel kunde</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Frist <input required name="deadline" type="date" />
      </label>
      <button disabled={action.isPending}>Legg til kunde</button>
      <ErrorMessage error={action.error} />
    </form>
  );
}

/** Opening, deadlines, links, invitation and reminder per client; closing the whole round. */
function Utsending({ round, asked }: { round: Round; asked: string | null }) {
  const clients = useClients();
  const action = useAction();
  const progress = useQuery({ ...progressQuery(round.id), enabled: round.status !== 'draft' });
  const done = finished(round);
  return (
    <>
      <section className="del runde" aria-label="Kundar i runden">
        <div className="runde-topp">
          <h2>Kundar i runden</h2>
        </div>
        <p className="under">
          Opne for svar, set frist og hent invitasjon eller påminning. Varde sender ingenting sjølv:
          leiaren hos kunden sender teksten frå si eiga e-post eller i Teams.
        </p>
        {round.round_clients.length === 0 && (
          <p className="under">Ingen kundar enno. Legg til den første under.</p>
        )}
        <div className="kundekort-grid">
          {round.round_clients.map((rc) => (
            <RoundClientCard
              key={rc.id}
              rc={rc}
              round={round.id}
              progress={progress.data?.clients.find((p) => p.round_client_id === rc.id)}
              reportReady={done && rc.released === true}
              asked={asked === rc.id}
            />
          ))}
        </div>
        {!done && <AddClient round={round} clients={clients.data ?? []} />}
        {round.status === 'open' && (
          <HoldButton
            className="fare"
            label="Avslutt heile runden"
            hint="Hald inne knappen i over eitt sekund for å avslutte runden. Lenkjene sluttar då å verke."
            disabled={action.isPending}
            onConfirm={() => action.mutate(() => mutate(`/api/admin/rounds/${round.id}/close`))}
          />
        )}
        <ErrorMessage error={action.error ?? progress.error ?? clients.error} />
      </section>
      <Logg title="Hendingar i runden" round={round.id} />
    </>
  );
}

/** Progress of the open rounds in a list (Rundar, Kundar): answers so far per round client. */
export function useAnswers(rounds: Round[]) {
  const open = rounds.filter((r) => r.status === 'open');
  const progress = useQueries({ queries: open.map((r) => progressQuery(r.id)) });
  return new Map(
    progress
      .flatMap((p) => p.data?.clients ?? [])
      .map((p) => [p.round_client_id, p.responses_total]),
  );
}
