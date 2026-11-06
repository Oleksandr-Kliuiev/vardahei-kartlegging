// The end of a conversation (2.20): what is not rated yet, what should be looked at (Manglar first) with
// the conclusions, what is in place, the overall impression and what was agreed, and the own notes.
// «Vis for kunden» hides the notes and the score, so the screen can be turned to the client.
// «Fullfør samtalen» sends what is left, then locks the conversation; «Opne for endring» opens it again.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import { follow, goTo, useTitle } from './nav.js';
import { ErrorMessage } from './queries.js';
import { Fordeling, Mark } from './samtale-felt.js';
import { useLagring } from './samtale-lagring.js';
import {
  countOf,
  dmy,
  type Interview,
  peopleText,
  RATING,
  type Rating,
  scoreOf,
  useInterview,
} from './samtale-models.js';
import { Topp, useReopen } from './samtale-page.js';
import './samtale.css';

export function OppsummeringPage({ id }: { id: string }) {
  const q = useInterview(id);
  const i = q.data;
  const store = useLagring(i);
  const queries = useQueryClient();
  useTitle(i ? `${i.client.name} – oppsummering` : undefined);
  const [kunde, setKunde] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const reopened = useReopen(i, store);
  if (!i || !store)
    return (
      <div className="sm-tom-side">
        <ErrorMessage error={q.error} />
        {!q.error && <p role="status">Hentar samtalen …</p>}
      </div>
    );
  const questions = i.guide.questions;
  const counts = countOf(questions, store.rating);
  const score = scoreOf(counts);
  const at = (n: number) => `/admin/samtalar/${id}?q=${questions[n]!.id}`;
  const items = questions.map((q, n) => ({ q, n, r: store.rating(q.id) }));
  const unrated = items.filter((x) => !x.r);
  const notes = items.filter((x) => store.text(`${x.q.id}:note`).trim());
  const done = store.locked;
  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await store.flush()))
        throw new Error('Nokre endringar er ikkje lagra enno. Sjå meldinga øvst, og prøv igjen.');
      const r = await mutate<{ done_at: string }>(`/api/admin/interviews/${id}/done`);
      queries.setQueryData<Interview>(['samtalar', 'interview', id], (old) =>
        old ? { ...old, status: 'done', done_at: r.done_at } : old,
      );
      store.setLocked(true);
      void queries.invalidateQueries({ queryKey: ['samtalar'], refetchType: 'none' });
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  };
  const textField = (key: ':summary' | ':agreed', label: string, hint: string) => (
    <div className="sm-felt">
      <div className="sm-label">
        <label htmlFor={`sm${key.slice(1)}`}>{label}</label>
        <span className="sm-hint" id={`sm${key.slice(1)}-h`}>
          {hint}
        </span>
      </div>
      <textarea
        id={`sm${key.slice(1)}`}
        aria-describedby={`sm${key.slice(1)}-h`}
        className="input sm-ta sm-ta-kort"
        value={store.text(key)}
        readOnly={done}
        onChange={(e) => store.set(key, e.target.value)}
      />
    </div>
  );
  const finishButton = !done && (
    <button type="button" className="btn primary" disabled={busy} onClick={() => void finish()}>
      <Icon name="hake" small />
      {busy ? 'Fullfører …' : 'Fullfør samtalen'}
    </button>
  );
  return (
    <div className="sm-samtale">
      <Topp i={i} store={store}>
        <label className="sm-brytar">
          <input type="checkbox" checked={kunde} onChange={(e) => setKunde(e.target.checked)} />
          Vis for kunden
        </label>
        {finishButton}
      </Topp>
      <div className="sm-sum">
        <a className="lenkje" href={at(0)} onClick={(e) => follow(e, at(0))}>
          <Icon name="tilbake" small />
          Tilbake til spørsmåla
        </a>
        {done && (
          <div className="sm-melding sm-ok" role="status">
            <span>
              <Icon name="hake" small />
              <b>Fullført {dmy(i.done_at?.slice(0, 10) ?? null)}.</b> Samtalen er låst og er no med
              på kundesida.
            </span>
            <button type="button" className="btn sm" onClick={() => void reopened.reopen()}>
              Opne for endring
            </button>
          </div>
        )}
        {kunde && (
          <p className="sm-melding sm-info">
            Kundevising: eigne notat og poeng er skjulte. Snu skjermen og gå gjennom saman med
            kunden.
          </p>
        )}
        <ErrorMessage error={error ?? reopened.error} />
        <section className="sm-sum-hovud" aria-label="Fordeling">
          <h2>Oppsummering</h2>
          <p className="sm-meta">
            {peopleText(i.interviewees)} · frå Vardahei: {i.interviewers.join(' og ') || '–'} ·{' '}
            {dmy(i.held_on)}
            {!kunde && score !== null && (
              <>
                {' '}
                · poeng <b>{score}</b>
              </>
            )}
          </p>
          <Fordeling counts={counts} tall label="Fordeling av vurderingane" />
          <p className="sm-forklaring">
            {(['ivaretatt', 'forbetring', 'manglar', 'ikkje_aktuelt'] as Rating[]).map((r) => (
              <span key={r}>
                <Mark rating={r} />
                {RATING[r].word} {counts[r]}
              </span>
            ))}
            <span>
              <Mark rating={null} />
              Ikkje vurdert {counts.none}
            </span>
          </p>
        </section>
        {unrated.length > 0 && !done && (
          <div className="sm-melding sm-varsel">
            <Icon name="varsel" small />
            <p>
              <b>
                {unrated.length}{' '}
                {unrated.length === 1 ? 'spørsmål er ikkje vurdert' : 'spørsmål er ikkje vurderte'}:
              </b>{' '}
              {unrated.map((x, k) => (
                <span key={x.q.id}>
                  {k > 0 && ', '}
                  <a href={at(x.n)} onClick={(e) => follow(e, at(x.n))}>
                    {x.n + 1} {x.q.short}
                  </a>
                </span>
              ))}
              . Du kan fullføre likevel og vurdere seinare.
            </p>
          </div>
        )}
        <div className="sm-sum-flate">
          <section className="kort sm-sjaa">
            <div className="kort-hovud">
              <h2>Dette bør de sjå på</h2>
              <p>Med tiltaka som går i referatet</p>
            </div>
            <div className="kort-innhald">
              {(['manglar', 'forbetring'] as Rating[]).map((r) => {
                const list = items.filter((x) => x.r === r);
                if (!list.length) return null;
                return (
                  <div key={r} className="sm-gruppe">
                    <h3>
                      <Mark rating={r} />
                      {RATING[r].word} <span className="muted">{list.length}</span>
                    </h3>
                    <ul>
                      {list.map((x) => (
                        <li key={x.q.id}>
                          <span className="sm-nr">{x.n + 1}</span>
                          <span className="sm-punkt">
                            <b>{x.q.short}</b>
                            {store.text(`${x.q.id}:action`).trim() ? (
                              <span>{store.text(`${x.q.id}:action`)}</span>
                            ) : (
                              <em>Ingen tiltak skrive</em>
                            )}
                          </span>
                          <a
                            className="linkbtn"
                            href={at(x.n)}
                            onClick={(e) => follow(e, at(x.n))}
                            aria-label={`Endre ${x.n + 1} ${x.q.short}`}
                          >
                            Endre
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {!items.some((x) => x.r === 'manglar' || x.r === 'forbetring') && (
                <p className="muted">
                  Ingenting er vurdert som Manglar eller Forbetringspotensial.
                </p>
              )}
            </div>
          </section>
          <div className="sm-sum-side">
            <section className="kort">
              <div className="kort-innhald">
                {textField(':summary', 'Samla inntrykk', 'Kjem med i referatet')}
                {textField(':agreed', 'Avtalt vidare', 'Kjem med i referatet')}
              </div>
            </section>
            <section className="kort">
              <div className="kort-hovud">
                <h2>
                  <Mark rating="ivaretatt" />
                  Dette er på plass <span className="muted">{counts.ivaretatt}</span>
                </h2>
              </div>
              <div className="kort-innhald">
                <ul className="sm-plass">
                  {items
                    .filter((x) => x.r === 'ivaretatt')
                    .map((x) => (
                      <li key={x.q.id}>
                        <span className="sm-nr">{x.n + 1}</span>
                        {x.q.short}
                      </li>
                    ))}
                </ul>
                {!counts.ivaretatt && <p className="muted">Ingenting enno.</p>}
              </div>
            </section>
            {!kunde && (
              <section className="kort sm-intern">
                <div className="kort-hovud">
                  <h2>
                    <Icon name="las" small />
                    Eige notat <span className="muted">{notes.length}</span>
                  </h2>
                  <p>Berre for Vardahei. Kjem ikkje i referatet.</p>
                </div>
                <div className="kort-innhald">
                  {notes.length > 0 && (
                    <ul className="sm-notat">
                      {notes.map((x) => (
                        <li key={x.q.id}>
                          <b>
                            {x.n + 1} · {x.q.short}:
                          </b>{' '}
                          {store.text(`${x.q.id}:note`)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <label className="sm-label" htmlFor="sm-notat-heile">
                    Notat om heile samtalen
                  </label>
                  <textarea
                    id="sm-notat-heile"
                    className="input sm-ta sm-ta-kort sm-ta-notat"
                    value={store.text(':note')}
                    readOnly={done}
                    placeholder="Til dømes kven som bør følgje opp, og når."
                    onChange={(e) => store.set(':note', e.target.value)}
                  />
                </div>
              </section>
            )}
          </div>
        </div>
        <div className="sm-sum-fot">
          <button type="button" className="btn ghost" onClick={() => goTo(at(0))}>
            Tilbake til spørsmåla
          </button>
          {finishButton}
        </div>
      </div>
    </div>
  );
}
