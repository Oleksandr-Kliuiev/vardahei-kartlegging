// The end of a conversation (2.20): what is not rated yet, what should be looked at (Manglar first) with
// the conclusions, what is in place, the overall impression and what was agreed, and the own notes.
// «Vis for kunden» hides the notes and the score, so the screen can be turned to the client.
// «Fullfør samtalen» sends what is left, then locks the conversation; «Opne for endring» opens it again.
// Its bar names the client and leads back to the round; the steps in it lead to the questions (10.11).
// A repeat conversation adds «Før og etter» against the previous one (3.2).
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import { follow, goTo, useTitle } from './nav.js';
import { ErrorMessage } from './queries.js';
import { Fordeling, Konflikt, Mark, MAX } from './samtale-felt.js';
import { ForOgEtter } from './samtale-for-etter.js';
import { type FieldKey, type Lagring, useLagring } from './samtale-lagring.js';
import { LeiarOgTilsette } from './samtale-leiar-tilsette.js';
import {
  clock,
  countOf,
  dmy,
  type GuideQuestion,
  type Interview,
  longDate,
  peopleText,
  plain,
  RATING,
  type Rating,
  scoreOf,
  today,
  useInterview,
} from './samtale-models.js';
import { Steg, tilRunda, TomSide, Topp, Utlogga, useReopen } from './samtale-page.js';
import { PunktTiltak } from './samtale-tiltak.js';
import './samtale.css';

/** The fields of the whole conversation, with the id of their box on this page. */
const META: Record<string, [label: string, box: string]> = {
  ':summary': ['Samla inntrykk', 'smsummary'],
  ':agreed': ['Avtalt vidare', 'smagreed'],
  ':note': ['Notat om heile samtalen', 'sm-notat-heile'],
};
const FIELD: Record<string, string> = {
  answer: 'Kva seier kunden?',
  rating: 'Vurdering',
  action: 'Konklusjon og tiltak',
  actions: 'Tiltak frå katalogen',
  note: 'Eige notat',
};

/** Why «Fullfør» has to wait, in the words of the save line. */
function notSaved(store: Lagring) {
  if (store.conflicts.size)
    return 'Nokre felt er endra på ein annan skjerm. Vel kva som skal stå i dei (sjå meldinga øvst), og fullfør etterpå.';
  if (store.state.kind === 'offline')
    return 'Nokre endringar ligg berre på denne maskina, fordi nettet er borte. Fullfør når dei er lagra.';
  if (store.state.kind === 'auth')
    return 'Du er logga ut. Logg inn igjen, så blir endringane lagra, og fullfør etterpå.';
  if (store.state.kind === 'error') return `Nokre endringar er ikkje lagra: ${store.state.message}`;
  return 'Nokre endringar er ikkje lagra enno. Prøv igjen om litt.';
}

/** «Fullført og lagra 25.11.2026 kl. 15:30.» (2.21, concept), without the time when it is not known. */
const savedText = (i: Interview) => {
  if (!i.done_at) return 'Fullført og lagra.';
  const at = new Date(i.done_at);
  return `Fullført og lagra ${dmy(today(at))} kl. ${clock(at)}.`;
};

/** Fields another screen changed, each with a link to where the choice is made. */
function Konfliktar({
  store,
  questions,
  at,
}: {
  store: Lagring;
  questions: readonly GuideQuestion[];
  at: (n: number) => string;
}) {
  const keys = [...store.conflicts.keys()];
  if (!keys.length) return null;
  const link = (key: FieldKey) => {
    const meta = META[key];
    if (meta) return { to: `#${meta[1]}`, label: meta[0] };
    const q = key.slice(0, key.indexOf(':'));
    const n = questions.findIndex((x) => x.id === q);
    return {
      to: at(n),
      label: `${n + 1} ${questions[n]?.short ?? q} (${FIELD[key.slice(q.length + 1)]})`,
    };
  };
  return (
    <div className="sm-melding sm-varsel">
      <Icon name="varsel" small />
      <p>
        <b>
          {keys.length === 1 ? 'Eitt felt er endra' : `${keys.length} felt er endra`} på ein annan
          skjerm:
        </b>{' '}
        {keys.map((key, k) => {
          const { to, label } = link(key);
          return (
            <span key={key}>
              {k > 0 && ', '}
              <a href={to} onClick={(e) => !to.startsWith('#') && follow(e, to)}>
                {label}
              </a>
            </span>
          );
        })}
        . Vel kva som skal stå, så kan du fullføre.
      </p>
    </div>
  );
}

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
  if (!i || !store) return <TomSide error={q.error} />;
  const questions = i.guide.questions;
  const counts = countOf(questions, store.rating);
  const score = scoreOf(counts);
  const at = (n: number) => `/admin/samtalar/${id}?q=${questions[n]!.id}`;
  const referat = `/admin/samtalar/${id}/referat`;
  const oversikt = `/admin/samtalar/runde/${i.round.id}/oversikt`;
  const items = questions.map((q, n) => ({ q, n, r: store.rating(q.id) }));
  const unrated = items.filter((x) => !x.r);
  const notes = items.filter((x) => store.text(`${x.q.id}:note`).trim());
  const done = store.locked;
  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await store.flush())) throw new Error(notSaved(store));
      const r = await mutate<{ done_at: string }>(`/api/admin/interviews/${id}/done`);
      queries.setQueryData<Interview>(['samtalar', 'interview', id], (old) =>
        old ? { ...old, status: 'done', done_at: r.done_at } : old,
      );
      store.setLocked(true);
      void queries.invalidateQueries({ queryKey: ['samtalar'], refetchType: 'none' });
    } catch (e) {
      setError(plain(e));
    } finally {
      setBusy(false);
    }
  };
  // A finished conversation is read, not filled in: its fields become text, and an empty one says so in a
  // line instead of standing as an empty box.
  const textField = (key: ':summary' | ':agreed', label: string, hint: string) =>
    done ? (
      <div className="sm-felt">
        <div className="sm-label">
          <h3>{label}</h3>
          <span className="sm-hint">{hint}</span>
        </div>
        {store.text(key).trim() ? (
          <p className="sm-lesetekst">{store.text(key)}</p>
        ) : (
          <p className="sm-lesetekst muted">Ikkje fylt ut.</p>
        )}
      </div>
    ) : (
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
          maxLength={MAX}
          value={store.text(key)}
          readOnly={done}
          onChange={(e) => store.set(key, e.target.value)}
        />
        <Konflikt store={store} field={key} />
      </div>
    );
  const finishButton = (size: string) => (
    <button
      type="button"
      className={`btn primary ${size}`}
      disabled={busy}
      onClick={() => void finish()}
    >
      <Icon name="hake" small />
      {busy ? 'Fullfører …' : 'Fullfør samtalen'}
    </button>
  );
  return (
    <div className="sm-samtale">
      <Topp
        back={tilRunda(i)}
        title={i.client.name}
        sub={[peopleText(i.interviewees), dmy(i.held_on)].filter(Boolean).join(' · ')}
        store={store}
        action={done ? undefined : finishButton('sm')}
      >
        <Steg id={id} at="oppsummering" done={done} />
        {/* A button that stays pressed, not a switch: turning the screen to the client is a moment of
            the meeting, and the press says what it does. */}
        <button
          type="button"
          className={kunde ? 'btn sm sm-kundevising-pa' : 'btn sm'}
          aria-pressed={kunde}
          onClick={() => setKunde(!kunde)}
        >
          <Icon name="skjerm" small />
          Vis for kunden
        </button>
      </Topp>
      <div className="sm-sum">
        {done && (
          <div className="sm-melding sm-ok sm-ferdig" role="status">
            <Icon name="hake" small />
            <div>
              <p>
                <b>{savedText(i)}</b> Samtalen er no med i oversikta og på kundesida.
              </p>
              <div className="sm-handlingar">
                <a className="btn sm" href={referat} onClick={(e) => follow(e, referat)}>
                  <Icon name="dok" small />
                  Sjå referatet
                </a>
                <a className="btn sm" href={oversikt} onClick={(e) => follow(e, oversikt)}>
                  <Icon name="graf" small />
                  Til oversikta
                </a>
                <button type="button" className="linkbtn" onClick={() => void reopened.reopen()}>
                  Opne for endring
                </button>
              </div>
            </div>
          </div>
        )}
        {kunde && (
          <p className="sm-melding sm-info">
            Kundevising: eigne notat og poeng er skjulte. Snu skjermen og gå gjennom saman med
            kunden.
          </p>
        )}
        <Utlogga store={store} />
        <Konfliktar store={store} questions={questions} at={at} />
        <ErrorMessage error={error ?? reopened.error} />
        <section className="sm-sum-hovud" aria-label="Fordeling">
          <h2>Oppsummering</h2>
          <p className="sm-meta">
            {peopleText(i.interviewees)} · frå Vardahei: {i.interviewers.join(' og ') || '–'} ·{' '}
            {longDate(i.held_on)}
            {!kunde && score !== null && (
              <>
                {' '}
                · poeng <b>{score}</b>
                {/* A score of six answers out of 27 is not the client's score yet, and says so. */}
                {counts.none > 0 && (
                  <span className="sm-forebels">
                    {' '}
                    (førebels: {questions.length - counts.none} av {questions.length} vurderte)
                  </span>
                )}
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
            {/* One line by default: a list of 21 links pushed what was rated below the screen. */}
            <details className="sm-ikkje-vurdert">
              <summary>
                <b>
                  {unrated.length}{' '}
                  {unrated.length === 1
                    ? 'spørsmål er ikkje vurdert'
                    : 'spørsmål er ikkje vurderte'}
                  .
                </b>{' '}
                Du kan fullføre likevel og vurdere seinare.{' '}
                <span className="sm-vis-kva">
                  Vis kva for
                  <Icon name="chev" small />
                </span>
              </summary>
              <p>
                {unrated.map((x, k) => (
                  <span key={x.q.id}>
                    {k > 0 && ', '}
                    <a href={at(x.n)} onClick={(e) => follow(e, at(x.n))}>
                      {x.n + 1} {x.q.short}
                    </a>
                  </span>
                ))}
              </p>
            </details>
          </div>
        )}
        <div className="sm-sum-flate">
          <section className="kort sm-sjaa">
            <div className="kort-hovud">
              <h2>Dette bør de sjå på</h2>
              <p>{counts.manglar + counts.forbetring} punkt, med tiltaka som går i referatet</p>
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
                            <PunktTiltak store={store} question={x.q.id} />
                          </span>
                          {/* A finished conversation is locked: «Endre» would open a field that
                              cannot be changed until «Opne for endring». */}
                          {!done && (
                            <a
                              className="linkbtn"
                              href={at(x.n)}
                              onClick={(e) => follow(e, at(x.n))}
                              aria-label={`Endre ${x.n + 1} ${x.q.short}`}
                            >
                              Endre
                            </a>
                          )}
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
          <div className="sm-sum-midt">
            <section className="kort">
              <div className="kort-innhald">
                {textField(':summary', 'Samla inntrykk', 'Kjem med i referatet')}
                {textField(':agreed', 'Avtalt vidare', 'Kjem med i referatet')}
              </div>
            </section>
            {i.previous && (
              <ForOgEtter
                previous={i.previous}
                questions={questions}
                rating={store.rating}
                counts={counts}
                score={score}
                kunde={kunde}
              />
            )}
          </div>
          <div className="sm-sum-side">
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
                  {!done ? (
                    <>
                      <label className="sm-label" htmlFor="sm-notat-heile">
                        Notat om heile samtalen
                      </label>
                      <textarea
                        id="sm-notat-heile"
                        className="input sm-ta sm-ta-kort sm-ta-notat"
                        maxLength={MAX}
                        value={store.text(':note')}
                        placeholder="Til dømes kven som bør følgje opp, og når."
                        onChange={(e) => store.set(':note', e.target.value)}
                      />
                      <Konflikt store={store} field=":note" />
                    </>
                  ) : store.text(':note').trim() ? (
                    <>
                      <h3 className="sm-label">Notat om heile samtalen</h3>
                      <p className="sm-lesetekst">{store.text(':note')}</p>
                    </>
                  ) : (
                    !notes.length && <p className="sm-lesetekst muted">Ingen eigne notat.</p>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
        <LeiarOgTilsette interview={id} client={i.client.id} items={items} at={at} />
        {!done && (
          <div className="sm-sum-fot">
            <button type="button" className="btn ghost" onClick={() => goTo(at(0))}>
              <Icon name="tilbake" small />
              Tilbake til spørsmåla
            </button>
            {finishButton('')}
          </div>
        )}
      </div>
    </div>
  );
}
