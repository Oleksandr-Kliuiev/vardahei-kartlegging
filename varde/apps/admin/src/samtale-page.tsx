// A conversation at the client's table (2.20): the questions of the guide on the left, one question on
// the right to read aloud and fill in. Everything is saved by itself, field by field; ⌥1–⌥3 rate,
// ⌥0 marks «Ikkje aktuelt», ⌥↑/⌥↓ move between questions, also while typing. The page fills the
// window (focus mode); until it is finished, «Endre» in its bar corrects the people and the day.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
  useInterviewRound,
} from './samtale-models.js';
import { StartSamtale } from './samtale-start.js';
import { useModal } from './widgets.js';
import './samtale.css';

const FIELDS = ['answer', 'rating', 'action', 'actions', 'note'] as const;

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

/** A conversation still loading or not found. Focus mode has no menu, so the way back is on the page;
 * while loading it shows only after a moment, so a quick load does not flash it. */
export function TomSide({ error }: { error: Error | null }) {
  return (
    <div className="sm-tom-side">
      <ErrorMessage error={error} />
      {!error && <p role="status">Hentar samtalen …</p>}
      <a
        className={error ? 'lenkje' : 'lenkje sm-seinare'}
        href="/admin/samtalar"
        onClick={(e) => follow(e, '/admin/samtalar')}
      >
        <Icon name="tilbake" small />
        Til Samtalar
      </a>
    </div>
  );
}

/** «Fullført» in the bar of a finished conversation, where the minutes or «Fullfør» stood. */
export const Fullfort = () => (
  <span className="sm-status sm-status-ok">
    <Icon name="hake" small />
    Fullført
  </span>
);

/** The bar on top of a conversation and of its summary (focus mode of the concept): the way back, what
 * is on screen, and on the right how far it has come, what is saved and the next step. */
export function Topp(p: {
  back: { to: string; label: string };
  title: string;
  sub: string;
  store: Lagring;
  onEdit?: (() => void) | undefined;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const bar = useRef<HTMLElement>(null);
  // The list of questions and a question scrolled to stay below the bar, however many lines it takes.
  useEffect(() => {
    const el = bar.current;
    const page = el?.parentElement;
    if (!el || !page || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() =>
      page.style.setProperty('--sm-topp', `${el.offsetHeight}px`),
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return (
    <header className="sm-topp" ref={bar}>
      <a className="btn ghost sm" href={p.back.to} onClick={(e) => follow(e, p.back.to)}>
        <Icon name="tilbake" small />
        {p.back.label}
      </a>
      <div className="sm-kven">
        <h1>{p.title}</h1>
        <p>
          {p.sub}
          {p.onEdit && (
            <>
              {p.sub && ' · '}
              <button
                type="button"
                className="linkbtn sm-endre"
                aria-label="Endre kven som er med og dato"
                onClick={p.onEdit}
              >
                Endre
              </button>
            </>
          )}
        </p>
      </div>
      <div className="sm-topp-hogre">
        {p.children}
        <SaveLine store={p.store} />
        {p.action}
      </div>
    </header>
  );
}

export function SamtalePage({ id, search }: { id: string; search: string }) {
  const q = useInterview(id);
  const i = q.data;
  const store = useLagring(i);
  const queries = useQueryClient();
  // The names from Vardahei in this round, for «Endre».
  const round = useInterviewRound(i?.round.id);
  const [editing, setEditing] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  useModal(editing, opener, '.sm-samtale');
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

  if (!i || !store) return <TomSide error={q.error} />;
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
    // A question scrolled up under the bar comes back to the top (its scroll margin clears the bar).
    const card = document.querySelector('.sm-kort');
    const bar = document.querySelector('.sm-topp')?.getBoundingClientRect().bottom ?? 0;
    if (card && card.getBoundingClientRect().top < Math.max(bar, 0) + 8)
      card.scrollIntoView({ block: 'start' });
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
    // An action chosen from the catalogue counts as taken up too (acceptance of 2.22b).
    const written = ['answer', 'action', 'actions'].some((f) => store.text(`${q.id}:${f}`).trim());
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
  const summary = `/admin/samtalar/${id}/oppsummering`;
  return (
    <>
      <div className="sm-samtale" onKeyDown={keys}>
        <Topp
          back={{ to: `/admin/samtalar?runde=${i.round.id}`, label: 'Samtalar' }}
          title={i.client.name}
          sub={[peopleText(i.interviewees), dmy(i.held_on)].filter(Boolean).join(' · ')}
          store={store}
          onEdit={
            store.locked
              ? undefined
              : () => {
                  opener.current = document.activeElement as HTMLElement | null;
                  setEditing(true);
                }
          }
          action={
            <a className="btn sm primary" href={summary} onClick={(e) => follow(e, summary)}>
              Oppsummering
            </a>
          }
        >
          <span className="sm-framdrift">
            <span>
              <b>
                {rated(counts)} av {questions.length}
              </b>{' '}
              vurderte
            </span>
            <Fordeling counts={counts} label="Framdrift" />
          </span>
          {store.locked ? (
            <Fullfort />
          ) : (
            minutes !== null && (
              <span className="sm-tid">
                <Icon name="klokke" small />
                {minutes} min
              </span>
            )
          )}
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
              previous={i.previous}
              onPrev={() => go(cur - 1)}
              onNext={() => go(cur + 1)}
            />
          )}
        </div>
      </div>
      {editing && (
        <StartSamtale
          edit
          row={i}
          guide={{
            title: i.guide.title,
            label: i.guide.label,
            question_count: questions.length,
          }}
          names={round.data?.interviews.flatMap((r) => r.interviewers ?? []) ?? []}
          me={queries.getQueryData<{ name: string | null }>(['session'])?.name ?? null}
          onClose={() => setEditing(false)}
          onDone={(sent) => {
            setEditing(false);
            queries.setQueryData<Interview>(['samtalar', 'interview', id], (old) =>
              old ? { ...old, ...sent } : old,
            );
            void queries.invalidateQueries({ queryKey: ['samtalar'], refetchType: 'none' });
          }}
        />
      )}
    </>
  );
}
