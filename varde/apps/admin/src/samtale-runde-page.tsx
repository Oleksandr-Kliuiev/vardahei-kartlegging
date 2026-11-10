// The page of one round of conversations (10.11, variant B), laid out like the page of a round in
// «Rundar»: «Kundar» to find the client at the table and start or go on, «Oversikt» across its finished
// conversations, «Innstillingar» for the name, the end of the round and its deletion. The round is
// chosen once, by opening it; nothing on these tabs asks for it again.
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import { Tilstand } from './kunde-samtalar.js';
import { follow, goTo, useTitle } from './nav.js';
import { byNorsk } from './norsk.js';
import { ErrorMessage, useClients } from './queries.js';
import { framdrift, rundeStatus } from './samtalar-page.js';
import { LeggTilKundar } from './samtale-dialogar.js';
import { Fordeling } from './samtale-felt.js';
import {
  dmy,
  type InterviewRow,
  peopleText,
  rated,
  type RoundSummary,
  type RoundView,
  type Status,
  useInterviewRound,
  useInterviewRounds,
} from './samtale-models.js';
import { OversiktPage } from './samtale-oversikt.js';
import { Dialog, StartSamtale } from './samtale-start.js';
import { useToast } from './shell.js';
import { Faner, HoldButton, Seg, useModal } from './widgets.js';
import './samtale.css';

const TABS = [
  ['kundar', 'Kundar'],
  ['oversikt', 'Oversikt'],
  ['innstillingar', 'Innstillingar'],
] as const;
type Tab = (typeof TABS)[number][0];

/** Going on first (the one you came back for), then not started by name, then finished, newest first. */
const ORDER: Record<Status, number> = { in_progress: 0, planned: 1, done: 2 };
const sorted = (rows: readonly InterviewRow[]) =>
  [...rows].sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      (a.status === 'planned'
        ? byNorsk(a.client.name, b.client.name)
        : a.status === 'done'
          ? (b.done_at ?? '').localeCompare(a.done_at ?? '')
          : b.updated_at.localeCompare(a.updated_at)),
  );

export function SamtaleRundePage({
  id,
  tab,
  search,
}: {
  id: string;
  tab: string | undefined;
  search: string;
}) {
  const rounds = useInterviewRounds();
  const summary = rounds.data?.find((r) => r.id === id);
  // Read only while the round is in the list: a round just deleted is not asked for again (a 404).
  const view = useInterviewRound(summary ? id : undefined);
  const fane: Tab = TABS.find(([k]) => k === tab)?.[0] ?? 'kundar';
  const label = TABS.find(([k]) => k === fane)![1];
  useTitle(summary ? `${label} · ${summary.name}` : undefined);
  const back = (
    <a className="rom-tilbake" href="/admin/samtalar" onClick={(e) => follow(e, '/admin/samtalar')}>
      <Icon name="tilbake" small />
      Alle samtalerunder
    </a>
  );
  if (!summary)
    return (
      <div className="rom-topp">
        {back}
        <ErrorMessage error={rounds.error} />
        <p role="status">
          {rounds.data && !rounds.isFetching
            ? 'Samtalerunda finst ikkje.'
            : 'Hentar samtalerunda …'}
        </p>
      </div>
    );
  const [status, chip] = rundeStatus(summary.status);
  const base = `/admin/samtalar/runde/${summary.id}`;
  const guide = view.data?.guide;
  const facts = [
    guide
      ? `${guide.title} · ${guide.label} · ${guide.question_count} spørsmål`
      : `${summary.guide.title} · ${summary.guide.label}`,
    framdrift(summary.counts),
  ];
  return (
    <>
      <div className="rom-topp">
        {back}
        <div className="sidetittel">
          <div>
            <h1>{summary.name}</h1>
            <p>{facts.join(' · ')}</p>
          </div>
          <span className="handlingar">
            <span className={chip}>{status}</span>
          </span>
        </div>
      </div>
      <Faner
        label="Samtalerunda"
        items={TABS.map(([k, text]) => [`${base}/${k}`, text] as const)}
        current={`${base}/${fane}`}
      />
      {fane === 'kundar' && <Kundar summary={summary} view={view.data} error={view.error} />}
      {fane === 'oversikt' && <OversiktPage round={summary.id} search={search} />}
      {fane === 'innstillingar' && <Innstillingar key={summary.id} round={summary} />}
    </>
  );
}

type Filter = 'alle' | Status;

/** The clients of the round: found by name, filtered by state, each with the one thing to do next. */
function Kundar({
  summary,
  view,
  error,
}: {
  summary: RoundSummary;
  view: RoundView | undefined;
  error: Error | null;
}) {
  const queries = useQueryClient();
  const clients = useClients();
  const [find, setFind] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const [panel, setPanel] = useState<null | 'kundar' | InterviewRow | { slett: InterviewRow }>(
    null,
  );
  const opener = useRef<HTMLElement | null>(null);
  useModal(panel !== null, opener, '.sm-rundeside > :not(.sm-skuff, .sm-slor, .sm-dlg-slor)');
  const me = queries.getQueryData<{ name: string | null }>(['session'])?.name ?? null;
  const rows = useMemo(() => sorted(view?.interviews ?? []), [view]);
  const isOpen = summary.status === 'open';
  const total = view?.guide.question_count ?? 0;
  const known = new Set(rows.map((r) => r.client.id));
  const words = find.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (filter === 'alle' || r.status === filter) &&
      (!words || r.client.name.toLowerCase().includes(words)),
  );
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const open = (p: 'kundar' | InterviewRow | { slett: InterviewRow }) => {
    opener.current = document.activeElement as HTMLElement | null;
    setPanel(p);
  };
  const refresh = () => void queries.invalidateQueries({ queryKey: ['samtalar'] });

  const row = (r: InterviewRow) => {
    // A finished conversation opens on its summary: after the meeting that is what is wanted, not
    // question 1 behind locked fields.
    const to =
      r.status === 'done' ? `/admin/samtalar/${r.id}/oppsummering` : `/admin/samtalar/${r.id}`;
    const meta =
      r.status === 'planned'
        ? ''
        : [
            r.status === 'in_progress' ? `${rated(r.counts)} av ${total} vurderte` : '',
            peopleText(r.interviewees),
          ]
            .filter(Boolean)
            .join(' · ');
    return (
      <li key={r.id} className="sm-kunderad">
        <span className="sm-rundnamn">
          <b>{r.client.name}</b>
          {meta && <span>{meta}</span>}
        </span>
        <span className="sm-kunderad-status">
          <Tilstand status={r.status} />
        </span>
        <span className="sm-kunderad-fordeling">
          {r.status !== 'planned' && <Fordeling counts={r.counts} label={r.client.name} />}
        </span>
        <span className="sm-kunderad-dato tnum">
          {r.held_on && (
            <>
              <span className="sr-only">Dato </span>
              {dmy(r.held_on)}
            </>
          )}
        </span>
        <span className="sm-kunderad-poeng tnum">
          {r.status === 'done' && r.score !== null && (
            <>
              <span className="sr-only">Poeng </span>
              <b>{r.score}</b>
            </>
          )}
        </span>
        <span className="sm-kunderad-gjer">
          {r.status === 'planned' ? (
            // A closed round takes no new conversation, so the press is not offered either.
            <button type="button" className="btn sm" disabled={!isOpen} onClick={() => open(r)}>
              Start samtale
            </button>
          ) : (
            <a
              className={r.status === 'in_progress' ? 'btn sm primary' : 'btn sm'}
              href={to}
              onClick={(e) => follow(e, to)}
            >
              {r.status === 'in_progress' ? 'Hald fram' : 'Opne'}
            </a>
          )}
          <button
            type="button"
            className="ikonknapp sm-slett"
            aria-label={`Slett samtalen med ${r.client.name}`}
            title="Slett samtalen"
            onClick={() => open({ slett: r })}
          >
            <Icon name="slett" small />
          </button>
        </span>
      </li>
    );
  };

  return (
    <div className="sm-rundeside">
      <ErrorMessage error={error} />
      {!isOpen && (
        <div className="sm-melding sm-info" role="status">
          <span>
            Runda er avslutta. Du kan ikkje starte nye samtalar eller leggje til kundar.{' '}
            <a
              href={`/admin/samtalar/runde/${summary.id}/innstillingar`}
              onClick={(e) => follow(e, `/admin/samtalar/runde/${summary.id}/innstillingar`)}
            >
              Opne runda att
            </a>
          </span>
        </div>
      )}
      {view && rows.length > 0 && (
        <div className="sm-verktoy">
          <label className="sm-finn">
            <span className="sr-only">Finn kunde</span>
            <Icon name="sok" small />
            <input
              className="input"
              type="search"
              value={find}
              placeholder="Finn kunde"
              onChange={(e) => setFind(e.target.value)}
            />
          </label>
          <Seg
            label="Status"
            value={filter}
            options={[
              ['alle', `Alle ${rows.length}`],
              ['in_progress', `Pågår ${count('in_progress')}`],
              ['planned', `Ikkje starta ${count('planned')}`],
              ['done', `Fullførte ${count('done')}`],
            ]}
            onChange={setFilter}
          />
          <span className="sm-verktoy-hogre">
            {isOpen && (
              <button type="button" className="btn sm" onClick={() => open('kundar')}>
                <Icon name="pluss" small />
                Legg til kundar
              </button>
            )}
          </span>
        </div>
      )}
      {view && rows.length > 0 && (
        <section className="kort sm-gruppekort" aria-label="Kundane i runda">
          <div className="sm-kunderad sm-kunderad-hovud" aria-hidden="true">
            <span>Kunde</span>
            <span>Status</span>
            <span>Fordeling</span>
            <span>Dato</span>
            <span>Poeng</span>
            <span />
          </div>
          {shown.length ? (
            <ul className="sm-rundliste">{shown.map(row)}</ul>
          ) : (
            <p className="muted sm-ingen-treff" role="status">
              {words
                ? `Ingen kundar i runda passar til «${find.trim()}».`
                : 'Ingen kundar med denne statusen.'}
            </p>
          )}
        </section>
      )}
      {view && !rows.length && (
        <section className="kort sm-gruppekort">
          <div className="kort-innhald sm-tomt">
            <h2>Ingen kundar i runda enno</h2>
            {isOpen ? (
              <>
                <p>Legg til kundane de skal snakke med.</p>
                <button type="button" className="btn primary" onClick={() => open('kundar')}>
                  <Icon name="pluss" small />
                  Legg til kundar
                </button>
              </>
            ) : (
              <p>Runda er avslutta, så du kan ikkje leggje til fleire.</p>
            )}
          </div>
        </section>
      )}
      {!view && !error && <p role="status">Hentar kundane i runda …</p>}
      {panel === 'kundar' && (
        <LeggTilKundar
          round={summary}
          clients={(clients.data ?? []).filter((c) => !known.has(c.id))}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            refresh();
          }}
        />
      )}
      {panel !== null && typeof panel === 'object' && 'slett' in panel && (
        <SlettSamtale
          row={panel.slett}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            refresh();
          }}
        />
      )}
      {panel !== null && typeof panel === 'object' && !('slett' in panel) && (
        <StartSamtale
          row={panel}
          guide={view?.guide ?? null}
          names={rows.flatMap((r) => r.interviewers ?? [])}
          me={me}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            refresh();
            goTo(`/admin/samtalar/${panel.id}`);
          }}
        />
      )}
    </div>
  );
}

/**
 * Deleting one conversation (10.11): a client taken off the round, or a conversation held on the wrong
 * client or for practice. Nothing written in a planned one, so a plain press does it; once anything is
 * written the press has to be held, and the page says what goes with it.
 */
function SlettSamtale({
  row,
  onClose,
  onDone,
}: {
  row: InterviewRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const planned = row.status === 'planned';
  const remove = () => {
    setBusy(true);
    setError(null);
    mutate(`/api/admin/interviews/${row.id}`, 'DELETE')
      .then(() => {
        toast(
          planned
            ? `${row.client.name} er teken ut av runda.`
            : `Samtalen med ${row.client.name} er sletta.`,
        );
        onDone();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err : new Error('Noko gjekk gale.'));
        setBusy(false);
      });
  };
  return (
    <Dialog
      title={`Slett samtalen med ${row.client.name}?`}
      busy={busy}
      onClose={onClose}
      onSubmit={(e) => e.preventDefault()}
      footer={
        <div className="sm-dlg-knappar">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            Avbryt
          </button>
          {planned ? (
            <button type="button" className="btn fare" disabled={busy} onClick={remove}>
              <Icon name="slett" small />
              Slett samtalen
            </button>
          ) : (
            <HoldButton
              className="fare"
              label="Slett samtalen"
              hint="Hald inne knappen i over eitt sekund. Alt som er skrive i samtalen blir borte."
              disabled={busy}
              onConfirm={remove}
            />
          )}
        </div>
      }
    >
      <p className="sm-dlg-tekst">
        {planned
          ? 'Samtalen er ikkje starta, så det er ingenting skrive i henne. Kunden blir teken ut av runda, og du kan leggje han til att seinare.'
          : `${row.status === 'done' ? 'Samtalen er fullført.' : 'Samtalen er i gang.'} Svara, vurderingane, tiltaka, notata og referatet blir sletta for godt, og samtalen forsvinn frå oversikta og kundesida. Det kan ikkje angrast.`}
      </p>
      <ErrorMessage error={error} />
    </Dialog>
  );
}

/**
 * «Innstillingar» (the panel «Endre runda» of 10.11, now a tab): the name of the round, the end of the
 * tour and the deletion of the round, conversations and all. Closing deletes nothing and opening the round
 * again undoes it, so the page says as much.
 */
function Innstillingar({ round }: { round: RoundSummary }) {
  const queries = useQueryClient();
  const [name, setName] = useState(round.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [saved, setSaved] = useState(false);
  const open = round.status === 'open';
  const left = round.counts.total - round.counts.done;
  // Nobody has sat down in it yet: it can go. One conversation, and the round keeps everything.
  const untouched = round.counts.done === 0 && round.counts.in_progress === 0;
  const run = (work: Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    work
      .then(() => {
        after?.();
        void queries.invalidateQueries({ queryKey: ['samtalar'] });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error('Noko gjekk gale.')))
      .finally(() => setBusy(false));
  };
  const rename = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    run(mutate(`/api/admin/interview-rounds/${round.id}/name`, 'PUT', { name: name.trim() }), () =>
      setSaved(true),
    );
  };
  return (
    <div className="sm-innstillingar">
      <ErrorMessage error={error} />
      <section className="kort" aria-labelledby="sm-runde-namn">
        <div className="kort-hovud">
          <h2 id="sm-runde-namn">Namn på runda</h2>
        </div>
        <form className="kort-innhald sm-rundestell" onSubmit={rename} noValidate>
          <div className="sm-namnrad">
            <input
              className="input"
              aria-labelledby="sm-runde-namn"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
            <button
              className="btn primary"
              disabled={busy || !name.trim() || name.trim() === round.name}
            >
              Lagre namnet
            </button>
          </div>
          {saved && (
            <p className="forklaring" role="status">
              Namnet er lagra.
            </p>
          )}
        </form>
      </section>
      <section className="kort" aria-labelledby="sm-runde-slutt">
        <div className="kort-hovud">
          <h2 id="sm-runde-slutt">{open ? 'Avslutt runda' : 'Runda er avslutta'}</h2>
        </div>
        <div className="kort-innhald sm-rundestell">
          <p className="forklaring">
            {open
              ? `Runda blir ikkje sletta. Du kan korkje leggje til kundar eller starte nye samtalar i
                 henne. Samtalar som alt er i gang gjer du ferdig som før, og referata er like lesbare.
                 Du kan opne runda att når som helst.`
              : 'Du kan ikkje starte nye samtalar i henne. Opne henne att for å halde fram.'}
          </p>
          {open && left > 0 && (
            <p className="forklaring">
              {left} av {round.counts.total}{' '}
              {round.counts.total === 1 ? 'samtale er' : 'samtalar er'} ikkje fullførte.
            </p>
          )}
          <button
            type="button"
            className={open ? 'btn sm fare' : 'btn sm'}
            disabled={busy}
            onClick={() =>
              run(
                mutate(
                  `/api/admin/interview-rounds/${round.id}/${open ? 'close' : 'reopen'}`,
                  'POST',
                ),
              )
            }
          >
            {open ? 'Avslutt runda' : 'Opne runda att'}
          </button>
        </div>
      </section>
      <section className="kort" aria-labelledby="sm-runde-slett">
        <div className="kort-hovud">
          <h2 id="sm-runde-slett">Slett runda</h2>
        </div>
        <div className="kort-innhald sm-rundestell">
          <p className="forklaring">
            {untouched
              ? `Ingen har sett seg ned i henne enno, så runda og dei ${round.counts.total} ${
                  round.counts.total === 1 ? 'planlagde samtalen' : 'planlagde samtalane'
                } blir borte for godt. Det kan ikkje angrast.`
              : `Runda og alle dei ${round.counts.total} samtalane i henne blir sletta for godt, også det som er skrive: ${[
                  round.counts.done ? `${round.counts.done} fullførte` : '',
                  round.counts.in_progress ? `${round.counts.in_progress} i gang` : '',
                ]
                  .filter(Boolean)
                  .join(
                    ' og ',
                  )}. Svar, referat og tala i oversikta forsvinn òg. Det kan ikkje angrast. Vil du berre rydde, avslutt runda i staden.`}
          </p>
          <HoldButton
            className="fare"
            label="Slett runda"
            hint={
              untouched
                ? 'Hald inne knappen i over eitt sekund. Runda er tom og blir borte.'
                : 'Hald inne knappen i over eitt sekund. Runda og alle samtalane i henne blir borte.'
            }
            disabled={busy}
            onConfirm={() => {
              setBusy(true);
              setError(null);
              mutate(`/api/admin/interview-rounds/${round.id}`, 'DELETE')
                .then(() => {
                  // Out of the list at once: a refetch alone would ask the server for the round
                  // that is gone and answer itself with a 404 on the way to the page without it.
                  queries.setQueryData<RoundSummary[]>(['samtalar', 'rounds'], (old) =>
                    (old ?? []).filter((r) => r.id !== round.id),
                  );
                  queries.removeQueries({ queryKey: ['samtalar', 'round', round.id] });
                  goTo('/admin/samtalar');
                  void queries.invalidateQueries({ queryKey: ['samtalar'] });
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err : new Error('Noko gjekk gale.')),
                )
                .finally(() => setBusy(false));
            }}
          />
        </div>
      </section>
    </div>
  );
}
