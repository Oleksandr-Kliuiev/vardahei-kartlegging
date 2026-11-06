// «Samtalar» (2.20): the rounds of conversations with key people and, for the chosen round, its clients:
// going on, not started and finished. The boss picks the client at the table and starts the
// conversation there; a finished one opens read-only until «Opne for endring».
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from './icons.js';
import { follow, goTo } from './nav.js';
import { ErrorMessage, useClients } from './queries.js';
import { LeggTilKundar, NyRunde } from './samtale-dialogar.js';
import { Fordeling } from './samtale-felt.js';
import {
  dmy,
  type InterviewRow,
  peopleText,
  rated,
  useGuides,
  useInterviewRound,
  useInterviewRounds,
} from './samtale-models.js';
import { StartSamtale } from './samtale-start.js';
import { Seg, useModal } from './widgets.js';
import './samtale.css';

type Panel = null | 'ny' | 'kundar' | InterviewRow;

export function SamtalarPage({ search }: { search: string }) {
  const rounds = useInterviewRounds();
  const guides = useGuides();
  const clients = useClients();
  const queries = useQueryClient();
  const asked = new URLSearchParams(search).get('runde');
  const list = rounds.data ?? [];
  const chosen =
    list.find((r) => r.id === asked) ?? list.find((r) => r.status === 'open') ?? list[0];
  const round = useInterviewRound(chosen?.id);
  const [panel, setPanel] = useState<Panel>(null);
  const [all, setAll] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  useModal(panel !== null, opener, '.sm-rundar > :not(.sm-skuff, .sm-slor, .sm-dlg-slor)');
  const me = queries.getQueryData<{ name: string | null }>(['session'])?.name ?? null;
  const open = (p: Panel) => {
    opener.current = document.activeElement as HTMLElement | null;
    setPanel(p);
  };
  const refresh = () => void queries.invalidateQueries({ queryKey: ['samtalar'] });
  const rows = round.data?.interviews ?? [];
  const going = rows.filter((r) => r.status === 'in_progress');
  const planned = rows.filter((r) => r.status === 'planned');
  const finished = rows
    .filter((r) => r.status === 'done')
    .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));
  const total = round.data?.guide.question_count ?? 0;
  const known = new Set(rows.map((r) => r.client.id));

  const row = (r: InterviewRow) => {
    const to = `/admin/samtalar/${r.id}`;
    const meta =
      r.status === 'planned'
        ? null
        : [
            r.status === 'done'
              ? `Fullført ${dmy(r.done_at?.slice(0, 10) ?? null)}`
              : `${rated(r.counts)} av ${total} vurderte`,
            peopleText(r.interviewees),
          ]
            .filter(Boolean)
            .join(' · ');
    return (
      <li key={r.id} className="sm-rundrad">
        <span className="sm-rundnamn">
          <b>{r.client.name}</b>
          {meta && <span>{meta}</span>}
        </span>
        <span className="sm-rundtal">
          {r.status !== 'planned' && <Fordeling counts={r.counts} label={r.client.name} />}
          {r.status === 'done' && r.score !== null && <b className="tnum">{r.score}</b>}
        </span>
        {r.status === 'planned' ? (
          <button type="button" className="btn sm" onClick={() => open(r)}>
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
      </li>
    );
  };
  const group = (title: string, items: InterviewRow[], limit = Infinity) =>
    items.length > 0 && (
      <section className="kort sm-gruppekort">
        <div className="kort-hovud">
          <h2>
            {title} <span className="muted tnum">{items.length}</span>
          </h2>
        </div>
        <ul className="sm-rundliste">{items.slice(0, limit).map(row)}</ul>
        {items.length > limit && (
          <div className="sm-meir">
            <button type="button" className="linkbtn" onClick={() => setAll(!all)}>
              {all ? 'Vis færre' : `Vis alle ${items.length}`}
            </button>
          </div>
        )}
      </section>
    );

  return (
    <div className="sm-rundar">
      <ErrorMessage error={rounds.error ?? round.error} />
      <div className="sm-verktoy">
        {list.length > 1 && chosen && (
          <Seg
            label="Samtalerunde"
            value={chosen.id}
            options={list.map(
              (r) => [r.id, `${r.name} · ${r.counts.done} av ${r.counts.total}`] as const,
            )}
            onChange={(id) => goTo(`/admin/samtalar?runde=${id}`)}
          />
        )}
        <span className="sm-verktoy-hogre">
          {chosen && (
            <button type="button" className="btn sm ghost" onClick={() => open('kundar')}>
              <Icon name="pluss" small />
              Legg til kundar
            </button>
          )}
          <button
            type="button"
            className="btn sm"
            disabled={!guides.data?.length}
            onClick={() => open('ny')}
          >
            <Icon name="pluss" small />
            Ny samtalerunde
          </button>
        </span>
      </div>
      {rounds.data && !list.length && (
        <section className="kort sm-gruppekort">
          <div className="kort-innhald sm-tomt">
            <h2>Ingen samtalerunder enno</h2>
            <p>
              Ei samtalerunde er éin samtaleguide og kundane de skal snakke med.{' '}
              {guides.data && !guides.data.length
                ? 'Lag og publiser guiden først: Skjema → Nytt skjema → Samtale med nøkkelpersonar.'
                : 'Lag den første runda med knappen over.'}
            </p>
          </div>
        </section>
      )}
      {chosen && round.data && (
        <>
          <p className="sm-guide">
            {list.length === 1 && (
              <>
                <b>{chosen.name}</b> ·{' '}
              </>
            )}
            {round.data.guide.title} · {round.data.guide.label} · {total} spørsmål
          </p>
          {group('Pågår', going)}
          {group('Ikkje starta', planned, all ? Infinity : 6)}
          {group('Fullførte', finished)}
          {!rows.length && (
            <p className="muted">Ingen kundar i runda enno. Legg dei til med knappen over.</p>
          )}
        </>
      )}
      {panel === 'ny' && guides.data && (
        <NyRunde
          guides={guides.data}
          clients={clients.data ?? []}
          onClose={() => setPanel(null)}
          onCreated={(id) => {
            setPanel(null);
            refresh();
            goTo(`/admin/samtalar?runde=${id}`);
          }}
        />
      )}
      {panel === 'kundar' && chosen && (
        <LeggTilKundar
          round={chosen}
          clients={(clients.data ?? []).filter((c) => !known.has(c.id))}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            refresh();
          }}
        />
      )}
      {panel !== null && typeof panel === 'object' && (
        <StartSamtale
          row={panel}
          guide={round.data?.guide ?? null}
          names={rows.flatMap((r) => r.interviewers ?? [])}
          me={me}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            void queries.invalidateQueries({ queryKey: ['samtalar'] });
            goTo(`/admin/samtalar/${panel.id}`);
          }}
        />
      )}
    </div>
  );
}
