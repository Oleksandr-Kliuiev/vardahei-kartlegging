// «Rundar» (2.17): every round with its state, and the one wizard to start a new one. A round opens
// its own page with «Framdrift», «Utsending», «Resultat» and «Rapportar».
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from './icons.js';
import { LaunchForm } from './launch-form.js';
import type { Round, Version } from './models.js';
import { follow, goTo } from './nav.js';
import { ErrorMessage, useClients, useRounds, useVersions } from './queries.js';
import { ROUND_STATUS, roundWhen, useAnswers } from './runde-page.js';

function RundeRad({
  round,
  version,
  answers,
}: {
  round: Round;
  version: Version | undefined;
  answers: ReadonlyMap<string, number>;
}) {
  const to = `/admin/rounds/${round.id}`;
  const [status, chip] = ROUND_STATUS[round.status] ?? ['Avslutta', 'chip'];
  const n = round.round_clients.length;
  const svar = round.round_clients.reduce((s, rc) => s + (answers.get(rc.id) ?? 0), 0);
  const pop = round.round_clients.reduce((s, rc) => s + (rc.population_snapshot ?? 0), 0);
  const facts = [
    version ? `${version.title ?? version.template.key} · ${version.label}` : '',
    `${n} ${n === 1 ? 'kunde' : 'kundar'}`,
    roundWhen(round),
  ].filter(Boolean);
  return (
    <a className="rad-lenkje" href={to} onClick={(e) => follow(e, to)}>
      <span className="rad-hovud">
        <b>{round.name}</b>
        <small>{facts.join(' · ')}</small>
      </span>
      <span className="rad-tal">
        {round.status === 'open' && (
          <small>
            {svar}
            {pop > 0 && ` av ${pop}`} svar
          </small>
        )}
        {round.type === 'post_seminar' && <span className="chip accent">Etter seminar</span>}
        <span className={chip}>{status}</span>
      </span>
      <span className="rad-gaa" aria-hidden="true">
        <Icon name="chev" small />
      </span>
    </a>
  );
}

export function RundarPage() {
  const rounds = useRounds(),
    clients = useClients(),
    versions = useVersions();
  const queries = useQueryClient();
  // «Start ein runde med v3» (the workshop) and «Start ein runde» («I dag») open the wizard.
  const [asked] = useState(() => new URLSearchParams(window.location.search).get('ny'));
  const [making, setMaking] = useState(asked !== null);
  const list = rounds.data ?? [];
  const answers = useAnswers(list);
  const active = list.filter((r) => ['draft', 'open'].includes(r.status));
  const done = list.filter((r) => !['draft', 'open'].includes(r.status));
  const versionOf = (r: Round) => versions.data?.find((v) => v.id === r.template_version_id);
  const group = (title: string, items: Round[], empty: string) => (
    <section className="del rad-liste" aria-label={title}>
      <h2>{title}</h2>
      {rounds.data && items.length === 0 && <p className="under">{empty}</p>}
      <ul>
        {items.map((r) => (
          <li key={r.id}>
            <RundeRad round={r} version={versionOf(r)} answers={answers} />
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <>
      <div className="bib-topp">
        <p className="bib-tal" role="status">
          {rounds.data
            ? `${list.length} ${list.length === 1 ? 'runde' : 'rundar'}`
            : 'Hentar rundar …'}
        </p>
        {!making && (
          <button type="button" className="btn primary" onClick={() => setMaking(true)}>
            <Icon name="pluss" small />
            Start ein runde
          </button>
        )}
      </div>
      <ErrorMessage error={rounds.error ?? clients.error ?? versions.error} />
      {making && clients.data && versions.data && !(asked && versions.isFetching) && (
        <div className="rom-ny">
          <LaunchForm
            clients={clients.data}
            versions={versions.data}
            version={asked && asked !== '1' ? asked : undefined}
            onCreated={(id) => {
              void queries
                .invalidateQueries({ queryKey: ['rounds'] })
                .then(() => goTo(`/admin/rounds/${id}/utsending`));
            }}
          />
          <button type="button" className="btn" onClick={() => setMaking(false)}>
            Avbryt
          </button>
        </div>
      )}
      {group('Opne og nye', active, 'Ingen rundar er opne no.')}
      {group('Avslutta', done, 'Ingen avslutta rundar enno.')}
    </>
  );
}
