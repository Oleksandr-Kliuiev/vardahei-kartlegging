// A conversation at the client's table (2.20): the questions of the guide on the left, one question on
// the right to read aloud and fill in. Everything is saved by itself, field by field; ⌥1–⌥3 rate,
// ⌥0 marks «Ikkje aktuelt», ⌥↑/⌥↓ move between questions, also while typing.
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import { follow, goTo, replaceTo, useTitle } from './nav.js';
import { ErrorMessage } from './queries.js';
import { Fordeling, Mark, SaveLine, Sporsmalskort } from './samtale-felt.js';
import { type Lagring, useLagring } from './samtale-lagring.js';
import {
  countOf,
  dmy,
  type GuideQuestion,
  type Interview,
  peopleText,
  plain,
  rated,
  type Rating,
  useInterview,
} from './samtale-models.js';
import './samtale.css';

const FIELDS = ['answer', 'rating', 'action', 'note'] as const;

const KEYS: Record<string, Rating> = {
  Digit1: 'ivaretatt',
  Digit2: 'forbetring',
  Digit3: 'manglar',
  Digit0: 'ikkje_aktuelt',
  Numpad1: 'ivaretatt',
  Numpad2: 'forbetring',
  Numpad3: 'manglar',
  Numpad0: 'ikkje_aktuelt',
};

/** Minutes since the start, while the conversation is going on today. */
function useMinutes(started: string | null, going: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  if (!started || !going) return null;
  const min = Math.floor((now - new Date(started).getTime()) / 60_000);
  return min >= 0 && min < 12 * 60 ? min : null;
}

/** «Opne for endring», shared by the question page and the summary. */
export function useReopen(i: Interview | undefined, store: Lagring | null) {
  const queries = useQueryClient();
  const [error, setError] = useState<Error | null>(null);
  const reopen = async () => {
    if (!i) return;
    setError(null);
    try {
      await mutate(`/api/admin/interviews/${i.id}/reopen`);
      queries.setQueryData<Interview>(['samtalar', 'interview', i.id], (old) =>
        old ? { ...old, status: 'in_progress', done_at: null, done_by: null } : old,
      );
      store?.setLocked(false);
      void queries.invalidateQueries({ queryKey: ['samtalar'], refetchType: 'none' });
    } catch (e) {
      setError(plain(e));
    }
  };
  return { reopen, error };
}

/** «Fullført 10.11.2026.», or without the day when another screen finished it. */
export const doneText = (i: Interview) => {
  const day = dmy(i.done_at?.slice(0, 10) ?? null);
  return day ? `Fullført ${day}.` : 'Fullført.';
};

/** The session ran out: what was typed waits on this machine until the person signs in again. */
export function Utlogga({ store }: { store: Lagring }) {
  if (store.state.kind !== 'auth') return null;
  return (
    <div className="sm-melding sm-varsel" role="alert">
      <span>
        Du er logga ut. Det du har skrive, ligg trygt på denne maskina og blir lagra når du har
        logga inn igjen.
      </span>
      <a className="btn sm" href="/auth/login">
        Logg inn igjen
      </a>
    </div>
  );
}

export function Topp({
  i,
  store,
  children,
}: {
  i: Interview;
  store: Lagring;
  children?: React.ReactNode;
}) {
  const back = `/admin/samtalar?runde=${i.round.id}`;
  return (
    <header className="sm-topp">
      <a className="btn ghost sm" href={back} onClick={(e) => follow(e, back)}>
        <Icon name="tilbake" small />
        Samtalar
      </a>
      <div className="sm-kven">
        <h1>{i.client.name}</h1>
        <p>
          {[peopleText(i.interviewees), dmy(i.held_on), i.round.name].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="sm-topp-hogre">
        {children}
        <SaveLine store={store} />
      </div>
    </header>
  );
}

export function SamtalePage({ id, search }: { id: string; search: string }) {
  const q = useInterview(id);
  const i = q.data;
  const store = useLagring(i);
  useTitle(i ? `${i.client.name} – samtale` : undefined);
  const questions = useMemo(() => i?.guide.questions ?? [], [i]);
  const [cur, setCur] = useState(0);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const asked = new URLSearchParams(search).get('q');
    const n = questions.findIndex((x) => x.id === asked);
    if (n >= 0) setCur(n);
  }, [questions, search]);
  const { reopen, error } = useReopen(i, store);
  const minutes = useMinutes(i?.started_at ?? null, i?.status === 'in_progress');

  if (!i || !store)
    return (
      <div className="sm-tom-side">
        <ErrorMessage error={q.error} />
        {!q.error && <p role="status">Hentar samtalen …</p>}
      </div>
    );
  if (i.status === 'planned')
    return (
      <div className="sm-tom-side">
        <p>Samtalen med {i.client.name} er ikkje starta enno.</p>
        <a
          className="lenkje"
          href={`/admin/samtalar?runde=${i.round.id}`}
          onClick={(e) => follow(e, `/admin/samtalar?runde=${i.round.id}`)}
        >
          Start han frå lista over samtalar
        </a>
      </div>
    );

  const go = (n: number) => {
    if (n < 0) return;
    if (n >= questions.length) return goTo(`/admin/samtalar/${id}/oppsummering`);
    setCur(n);
    setMoved(true);
    replaceTo(`/admin/samtalar/${id}?q=${questions[n]!.id}`);
    const card = document.querySelector('.sm-kort');
    if (card && card.getBoundingClientRect().top < 120) card.scrollIntoView({ block: 'start' });
  };
  const counts = countOf(questions, store.rating);
  const question = questions[cur];
  const readOnly = store.locked;
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!e.altKey || e.metaKey || e.ctrlKey || !question) return;
    const r = KEYS[e.code];
    if (r) {
      e.preventDefault();
      if (!readOnly) {
        const k = `${question.id}:rating`;
        store.set(k, store.value(k) === r ? null : r);
      }
    } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      go(cur + (e.code === 'ArrowDown' ? 1 : -1));
    }
  };
  const sections = questions.reduce<{ title: string; items: { q: GuideQuestion; n: number }[] }[]>(
    (out, q, n) => {
      const last = out[out.length - 1];
      if (!last || last.title !== q.section) out.push({ title: q.section, items: [{ q, n }] });
      else last.items.push({ q, n });
      return out;
    },
    [],
  );
  const item = (q: GuideQuestion, n: number, compact: boolean) => {
    const rating = store.rating(q.id);
    const written = !!(store.text(`${q.id}:answer`).trim() || store.text(`${q.id}:action`).trim());
    const conflict = FIELDS.some((f) => store.conflicts.has(`${q.id}:${f}`));
    const state =
      (rating ? '' : written ? ', skrive, ikkje vurdert' : ', ikkje teke opp') +
      (conflict ? ', endra på ein annan skjerm' : '');
    return (
      <button
        key={q.id}
        type="button"
        className={['sm-rad', n === cur && 'sm-no', conflict && 'sm-rad-konflikt']
          .filter(Boolean)
          .join(' ')}
        aria-current={n === cur ? 'step' : undefined}
        onClick={() => go(n)}
        aria-label={compact ? `Spørsmål ${n + 1}, ${q.short}${state}` : undefined}
      >
        <span className="sm-nr">{n + 1}</span>
        {!compact && <span className="sm-kort-namn">{q.short}</span>}
        {!compact &&
          (conflict ? (
            <Icon name="varsel" small />
          ) : store.text(`${q.id}:note`).trim() ? (
            <Icon name="las" small />
          ) : (
            <span />
          ))}
        <Mark rating={rating} written={written} />
        {!compact && <span className="sr-only">{rating ? `, ${rating}` : state}</span>}
      </button>
    );
  };
  return (
    <div className="sm-samtale" onKeyDown={keys}>
      <Topp i={i} store={store}>
        <span className="sm-framdrift">
          <span>
            <b>
              {rated(counts)} av {questions.length}
            </b>{' '}
            vurderte
          </span>
          <Fordeling counts={counts} label="Framdrift" />
        </span>
        {minutes !== null && (
          <span className="sm-tid">
            <Icon name="kalender" small />
            {minutes} min
          </span>
        )}
        <a
          className="btn sm primary"
          href={`/admin/samtalar/${id}/oppsummering`}
          onClick={(e) => follow(e, `/admin/samtalar/${id}/oppsummering`)}
        >
          Oppsummering
        </a>
      </Topp>
      {store.locked && (
        <div className="sm-melding sm-ok" role="status">
          <span>
            <Icon name="hake" small />
            {doneText(i)} Felta er låste.
          </span>
          <button type="button" className="btn sm" onClick={() => void reopen()}>
            Opne for endring
          </button>
        </div>
      )}
      <Utlogga store={store} />
      <ErrorMessage error={error} />
      <nav className="sm-stripe" aria-label="Spørsmål">
        {questions.map((q, n) => item(q, n, true))}
      </nav>
      <div className="sm-flate">
        <nav className="sm-liste" aria-label="Spørsmål">
          {sections.map((s) => (
            <div key={`${s.title}-${s.items[0]!.n}`}>
              {s.title && <p className="sm-tema">{s.title}</p>}
              {s.items.map(({ q, n }) => item(q, n, false))}
            </div>
          ))}
        </nav>
        {question && (
          <Sporsmalskort
            key={question.id}
            q={question}
            n={cur + 1}
            total={questions.length}
            store={store}
            readOnly={readOnly}
            focusOnShow={moved}
            onPrev={() => go(cur - 1)}
            onNext={() => go(cur + 1)}
          />
        )}
      </div>
    </div>
  );
}
