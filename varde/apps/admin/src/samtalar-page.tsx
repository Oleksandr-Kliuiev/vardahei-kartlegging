// «Samtalar» (2.20; laid out like «Rundar» on 10.11, variant B): every round of conversations with how far
// it has come, and the panel for a new one. A round opens its own page with «Kundar», «Oversikt» and
// «Innstillingar» (samtale-runde-page.tsx), so the round is chosen once, by opening it.
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from './icons.js';
import { follow, goTo } from './nav.js';
import { ErrorMessage, useClients } from './queries.js';
import { NyRunde } from './samtale-dialogar.js';
import { longDate, type RoundSummary, useGuides, useInterviewRounds } from './samtale-models.js';
import { useModal } from './widgets.js';
import './samtale.css';
import './samtale-oversikt.css';

/** «Open» or «Avslutta», as a chip, the way «Rundar» marks its rounds. */
export const rundeStatus = (status: string): [string, string] =>
  status === 'open' ? ['Open', 'chip ok'] : ['Avslutta', 'chip warn'];

/** «2 av 48 fullførte · 1 pågår»: how far a round has come, in conversations. */
export function framdrift(c: RoundSummary['counts']) {
  return [`${c.done} av ${c.total} fullførte`, c.in_progress > 0 ? `${c.in_progress} pågår` : '']
    .filter(Boolean)
    .join(' · ');
}

function RundeRad({ round }: { round: RoundSummary }) {
  const to = `/admin/samtalar/runde/${round.id}`;
  const [status, chip] = rundeStatus(round.status);
  const c = round.counts;
  const done = c.total ? Math.round((c.done / c.total) * 100) : 0;
  const facts = [
    `${round.guide.title} · ${round.guide.label}`,
    `${c.total} ${c.total === 1 ? 'kunde' : 'kundar'}`,
    `oppretta ${longDate(round.created_at)}`,
  ];
  return (
    <a className="rad-lenkje sm-runderad" href={to} onClick={(e) => follow(e, to)}>
      <span className="rad-hovud">
        <b>{round.name}</b>
        <small>{facts.join(' · ')}</small>
      </span>
      <span className="sm-runde-framdrift">
        <span className="sm-maalar" role="img" aria-label={`${done} prosent fullført`}>
          <i style={{ width: `${done}%` }} />
        </span>
        <small className="tnum">{framdrift(c)}</small>
      </span>
      <span className="rad-tal">
        <span className={chip}>{status}</span>
      </span>
      <span className="rad-gaa" aria-hidden="true">
        <Icon name="chev" small />
      </span>
    </a>
  );
}

export function SamtalarPage() {
  const rounds = useInterviewRounds();
  const guides = useGuides();
  const clients = useClients();
  const queries = useQueryClient();
  const [making, setMaking] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  useModal(making, opener, '.sm-rundar > :not(.sm-skuff, .sm-slor)');
  const list = rounds.data ?? [];
  const open = list.filter((r) => r.status === 'open');
  const closed = list.filter((r) => r.status !== 'open');
  const noGuide = guides.data !== undefined && guides.data.length === 0;
  const group = (title: string, items: RoundSummary[]) =>
    items.length > 0 && (
      <section className="del rad-liste" aria-label={title}>
        <h2>{title}</h2>
        <ul>
          {items.map((r) => (
            <li key={r.id}>
              <RundeRad round={r} />
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <div className="sm-rundar">
      <div className="bib-topp">
        <p className="bib-tal" role="status">
          {rounds.data
            ? `${list.length} ${list.length === 1 ? 'samtalerunde' : 'samtalerunder'}`
            : 'Hentar samtalerundene …'}
        </p>
        <span className="sm-verktoy-hogre">
          {list.length > 1 && (
            <a
              className="btn"
              href="/admin/samtalar/oversikt"
              onClick={(e) => follow(e, '/admin/samtalar/oversikt')}
            >
              <Icon name="graf" small />
              Oversikt over alle
            </a>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={!guides.data?.length}
            onClick={() => {
              opener.current = document.activeElement as HTMLElement | null;
              setMaking(true);
            }}
          >
            <Icon name="pluss" small />
            Ny samtalerunde
          </button>
        </span>
      </div>
      <ErrorMessage error={rounds.error ?? guides.error} />
      {rounds.data && !list.length && (
        <section className="kort sm-gruppekort">
          <div className="kort-innhald sm-tomt">
            <h2>Ingen samtalerunder enno</h2>
            <p>
              Ei samtalerunde er éin samtaleguide og kundane de skal snakke med.{' '}
              {noGuide
                ? 'Lag og publiser guiden først: Skjema → Nytt skjema → Samtale med nøkkelpersonar.'
                : 'Lag den første runda med knappen over.'}
            </p>
          </div>
        </section>
      )}
      {group('Opne', open)}
      {group('Avslutta', closed)}
      {making && guides.data && (
        <NyRunde
          guides={guides.data}
          clients={clients.data ?? []}
          onClose={() => setMaking(false)}
          onCreated={(id) => {
            setMaking(false);
            void queries.invalidateQueries({ queryKey: ['samtalar'] });
            goTo(`/admin/samtalar/runde/${id}`);
          }}
        />
      )}
    </div>
  );
}
