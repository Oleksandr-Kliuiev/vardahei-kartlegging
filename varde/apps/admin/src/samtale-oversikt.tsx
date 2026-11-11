// «Oversikt» (2.21, concept; a tab of the round since 10.11): the finished conversations of one round,
// or of every round («Oversikt over alle»), and those going on when asked. Four tiles, every answer on
// one map (or as a table), the weakest points, the themes, the clients weakest first and the
// conclusions that recur; the CSV of the same choice. The round and «Ta med pågåande samtalar» live in
// the address, so back and reload keep them.
import { useRef, useState } from 'react';
import { Icon } from './icons.js';
import { follow, goTo } from './nav.js';
import { ErrorMessage } from './queries.js';
import { Fordeling, Mark } from './samtale-felt.js';
import { Kart, SvarTabell, Tips } from './samtale-kart.js';
import {
  dmy,
  type Overview,
  type Rating,
  RATING,
  useInterviewRounds,
  useOverview,
} from './samtale-models.js';
import { lowestFirst, missing, pct, ratedOf, weakest } from './samtale-tal.js';
import { TiltakIgjen } from './samtale-tiltak-oversikt.js';
import { Seg } from './widgets.js';
import './samtale.css';
import './samtale-oversikt.css';

const SCALE: (Rating | null)[] = ['ivaretatt', 'forbetring', 'manglar', 'ikkje_aktuelt', null];
/** The address of a choice: the round's own tab, or every round, and whether those going on count. */
const addressOf = (round: string | undefined, inProgress: boolean) =>
  `${round ? `/admin/samtalar/runde/${round}/oversikt` : '/admin/samtalar/oversikt'}${inProgress ? '?pagaande=1' : ''}`;

function Flisar({ o }: { o: Overview }) {
  const t = o.totals;
  const done = pct(t.done, t.conversations);
  return (
    <div className="sm-flisar">
      <div className="sm-flis">
        <span className="sm-flis-namn">Fullførte samtalar</span>
        <span className="sm-flis-tal">
          {t.done} <small>av {t.conversations}</small>
        </span>
        <span className="sm-maalar" role="img" aria-label={`${done} prosent fullført`}>
          <i style={{ width: `${done}%` }} />
        </span>
      </div>
      <div className="sm-flis">
        <span className="sm-flis-namn">Poeng i snitt</span>
        <span className="sm-flis-tal">
          {t.score ?? '–'} <small>av 100</small>
        </span>
        <span className="sm-flis-under">Ivaretatt 2, Forbetring 1, Manglar 0</span>
      </div>
      <div className="sm-flis">
        <span className="sm-flis-namn">Manglar</span>
        <span className="sm-flis-tal">
          {t.counts.manglar} <small>svar</small>
        </span>
        <span className="sm-flis-under">
          {pct(t.counts.manglar, ratedOf(t.counts))} % av vurderte svar
        </span>
      </div>
      <div className="sm-flis">
        <span className="sm-flis-namn">Tiltak skrivne</span>
        <span className="sm-flis-tal">{t.actions}</span>
        <span className="sm-flis-under">
          i {t.shown} {t.shown === 1 ? 'samtale' : 'samtalar'}
        </span>
      </div>
    </div>
  );
}

function Kortet({ o }: { o: Overview }) {
  const [order, setOrder] = useState<'svakast' | 'namn'>('svakast');
  const [table, setTable] = useState(false);
  return (
    <section className="kort" aria-labelledby="sm-kart-h">
      <div className="kort-hovud">
        <h2 id="sm-kart-h">Alle svar på eitt kart</h2>
        <div className="sm-kart-val" hidden={o.totals.shown === 0}>
          {!table && (
            <Seg
              label="Sortering"
              value={order}
              options={[
                ['svakast', 'Svakast først'],
                ['namn', 'Namn'],
              ]}
              onChange={setOrder}
            />
          )}
          <button type="button" className="linkbtn" onClick={() => setTable(!table)}>
            {table ? 'Vis som kart' : 'Vis som tabell'}
          </button>
        </div>
      </div>
      <div className="kort-innhald sm-kart-innhald">
        {o.totals.shown === 0 ? (
          <p className="muted">Ingen fullførte samtalar i dette utvalet enno.</p>
        ) : table ? (
          <SvarTabell data={o} />
        ) : (
          <>
            <p className="sm-forklaring">
              {SCALE.map((r) => (
                <span key={r ?? 'none'}>
                  <Mark rating={r} />
                  {r ? RATING[r].word : 'Ikkje vurdert'}
                </span>
              ))}
            </p>
            <Kart data={o} order={order} />
          </>
        )}
      </div>
    </section>
  );
}

function Punkt({ o }: { o: Overview }) {
  const [all, setAll] = useState(false);
  const list = weakest(o.questions);
  return (
    <section className="kort" aria-labelledby="sm-punkt-h">
      <div className="kort-hovud">
        <h2 id="sm-punkt-h">Svakaste punkt</h2>
        <p>Sortert etter del som manglar</p>
      </div>
      <div className="kort-innhald">
        <div className="sm-wp">
          <div className="sm-wp-rad sm-rad-hovud">
            <span />
            <span>Spørsmål</span>
            <span className="sm-rad-b">Fordeling</span>
            <span className="sm-rad-v">Manglar</span>
          </div>
          {(all ? list : list.slice(0, 10)).map((q) => {
            const m = missing(q.counts);
            return (
              <div key={q.id} className="sm-wp-rad">
                <span className="sm-nr">{q.no}</span>
                <span className="sm-rad-l" title={q.text}>
                  {q.short}
                </span>
                <Fordeling counts={q.counts} label={q.short} tips />
                <span className="sm-rad-v">{m === null ? '–' : `${Math.round(m * 100)} %`}</span>
              </div>
            );
          })}
        </div>
        {list.length > 10 && (
          <button type="button" className="linkbtn sm-meir-knapp" onClick={() => setAll(!all)}>
            {all ? 'Vis dei 10 svakaste' : `Vis alle ${list.length}`}
          </button>
        )}
      </div>
    </section>
  );
}

function Tema({ o }: { o: Overview }) {
  return (
    <section className="kort" aria-labelledby="sm-tema-h">
      <div className="kort-hovud">
        <h2 id="sm-tema-h">Per tema</h2>
        <p>Svakast øvst</p>
      </div>
      <div className="kort-innhald">
        <div className="sm-wp sm-tema">
          <div className="sm-tema-rad sm-rad-hovud">
            <span>Tema</span>
            <span className="sm-rad-b">Fordeling</span>
            <span className="sm-rad-v">Poeng</span>
          </div>
          {lowestFirst(o.sections, (s) => s.title).map((s) => (
            <div key={s.title} className="sm-tema-rad">
              <span className="sm-rad-l">{s.title}</span>
              <Fordeling counts={s.counts} label={s.title} tips />
              <span className="sm-rad-v">{s.score ?? '–'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Kundar({ o }: { o: Overview }) {
  return (
    <section className="kort" aria-labelledby="sm-kundar-h">
      <div className="kort-hovud">
        <h2 id="sm-kundar-h">Kundar</h2>
        <p>Svakast først: der vi truleg trengst mest</p>
      </div>
      <div className="kort-innhald">
        <div className="tabell-wrap" tabIndex={0} role="region" aria-label="Kundar, svakast først">
          <table className="sm-tabell sm-kundetabell">
            <thead>
              <tr>
                <th>Kunde</th>
                <th>Runde</th>
                <th>Dato</th>
                <th className="r">Poeng</th>
                <th>Fordeling</th>
                <th className="r">Manglar</th>
              </tr>
            </thead>
            <tbody>
              {lowestFirst(o.conversations, (r) => r.client.name).map((r) => (
                <tr key={r.id}>
                  <td>
                    <a
                      className="sm-kundelenkje"
                      href={`/admin/clients/${r.client.id}`}
                      onClick={(e) => follow(e, `/admin/clients/${r.client.id}`)}
                    >
                      {r.client.name}
                    </a>
                  </td>
                  <td>{r.round.name}</td>
                  <td className="tnum">{dmy(r.held_on)}</td>
                  <td className="r">{r.score ?? '–'}</td>
                  <td>
                    <Fordeling counts={r.counts} label={r.client.name} tips />
                  </td>
                  <td className="r">{r.counts.manglar}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** The overview of one round (its «Oversikt» tab) or, without `round`, of every round together. */
export function OversiktPage({ round, search }: { round?: string; search: string }) {
  const rounds = useInterviewRounds();
  const q = new URLSearchParams(search);
  const list = rounds.data ?? [];
  const inProgress = q.get('pagaande') === '1';
  const ids = round ? [round] : list.map((r) => r.id);
  const overview = useOverview(ids, inProgress);
  const o = overview.data;
  const root = useRef<HTMLDivElement>(null);
  const csv = `/api/admin/interview-rounds/export.csv?rounds=${ids.join(',')}${inProgress ? '&in_progress=true' : ''}`;
  return (
    <div className="sm-oversikt" ref={root}>
      <ErrorMessage error={rounds.error ?? overview.error} />
      {rounds.data && !list.length && (
        <section className="kort">
          <div className="kort-innhald sm-tomt">
            <h2>Ingen samtalerunder enno</h2>
            <p>Oversikta kjem når de har fullført samtalar i ei samtalerunde.</p>
          </div>
        </section>
      )}
      {ids.length > 0 && (
        <div className="sm-verktoy">
          <label className="sm-med">
            <input
              type="checkbox"
              checked={inProgress}
              onChange={(e) => goTo(addressOf(round, e.target.checked))}
            />
            Ta med pågåande samtalar
          </label>
          <span className="sm-verktoy-hogre">
            <a className="btn sm" href={csv} download>
              <Icon name="ned" small />
              Eksporter CSV
            </a>
          </span>
        </div>
      )}
      {ids.length > 0 && !o && !overview.error && <p role="status">Hentar oversikta …</p>}
      {o && (
        <>
          <Flisar o={o} />
          <Kortet o={o} />
          {o.totals.shown > 0 && (
            <>
              <div className="sm-duo">
                <Punkt o={o} />
                <Tema o={o} />
              </div>
              <Kundar o={o} />
              <TiltakIgjen o={o} />
            </>
          )}
          <Tips root={root} />
        </>
      )}
    </div>
  );
}
