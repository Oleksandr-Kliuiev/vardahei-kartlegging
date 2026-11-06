// One question of a conversation (2.20): the question to read aloud, the client's answer, the rating in
// three buttons and a quiet «Ikkje aktuelt», the conclusion for the report and an own note for Vardahei.
// Shared pieces: the rating mark, the bar of the scale and the line that says what is saved.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './icons.js';
import { follow } from './nav.js';
import { type FieldKey, type Lagring, placeOf } from './samtale-lagring.js';
import {
  clock,
  type Counts,
  type GuideQuestion,
  RATING,
  type Rating,
  SCALE,
} from './samtale-models.js';

/** The server takes up to 20 000 characters in a field; the box stops there instead of a refusal. */
export const MAX = 20_000;

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌥' : 'Alt+';

/** A rating as a glyph in a disc; an empty ring when unrated, with a dot when something is written. */
export function Mark({ rating, written = false }: { rating: Rating | null; written?: boolean }) {
  if (rating) {
    const r = RATING[rating];
    return (
      <span className={`sm-mark sm-${r.cls}`} aria-hidden="true">
        {r.glyph}
      </span>
    );
  }
  return (
    <span className={written ? 'sm-mark sm-tom sm-skrive' : 'sm-mark sm-tom'} aria-hidden="true" />
  );
}

const PARTS = [
  ['ivaretatt', 'iv'],
  ['forbetring', 'fb'],
  ['manglar', 'mg'],
  ['ikkje_aktuelt', 'na'],
  ['none', 'ingen'],
] as const;

/** One whole split into the parts of the scale; `tall` prints the counts inside the wide parts. */
export function Fordeling({
  counts,
  tall = false,
  label,
}: {
  counts: Counts;
  tall?: boolean;
  label: string;
}) {
  const total = PARTS.reduce((n, [k]) => n + counts[k], 0);
  const words = PARTS.filter(([k]) => counts[k] > 0)
    .map(([k]) => `${k === 'none' ? 'Ikkje vurdert' : RATING[k].word} ${counts[k]}`)
    .join(', ');
  return (
    <span
      className={tall ? 'sm-bar sm-bar-hoy' : 'sm-bar'}
      role="img"
      aria-label={`${label}: ${words}`}
    >
      {PARTS.filter(([k]) => counts[k] > 0).map(([k, cls]) => (
        <i key={k} className={`sm-${cls}`} style={{ flexGrow: counts[k] }}>
          {tall && total && counts[k] / total >= 0.1 ? counts[k] : null}
        </i>
      ))}
    </span>
  );
}

/** What is saved, in words people use. A field changed on another screen comes first: nothing is saved
 * over it until the person has chosen, so the line says so and leads there. */
export function SaveLine({ store }: { store: Lagring }) {
  const s = store.state,
    waiting = store.waiting();
  const n = `${waiting} ${waiting === 1 ? 'endring ligg' : 'endringar ligg'} på denne maskina`;
  const first = store.conflicts.keys().next();
  if (!first.done) {
    const to = placeOf(store.id, first.value);
    const count = store.conflicts.size;
    return (
      <span className="sm-lagra sm-feil" role="status">
        <i />
        {count === 1 ? 'Eitt felt' : `${count} felt`} er endra på ein annan skjerm ·{' '}
        <a href={to} onClick={(e) => follow(e, to)}>
          Vel kva som skal stå
        </a>
      </span>
    );
  }
  // A field the server refused stays named until it is changed: the others may have been saved since.
  const refused = store.refused.entries().next();
  if (!refused.done) {
    const [key, message] = refused.value;
    const to = placeOf(store.id, key);
    return (
      <span className="sm-lagra sm-feil" role="status">
        <i />
        {message} ·{' '}
        <a href={to} onClick={(e) => follow(e, to)}>
          Vis feltet
        </a>
      </span>
    );
  }
  if (s.kind === 'offline')
    return (
      <span className="sm-lagra sm-ventar" role="status">
        <i />
        Ventar på nett · {n}
      </span>
    );
  if (s.kind === 'auth')
    return (
      <span className="sm-lagra sm-ventar" role="status">
        <i />
        Logga ut · {n}
      </span>
    );
  if (s.kind === 'error')
    return (
      <span className="sm-lagra sm-feil" role="status">
        <i />
        {s.message}
      </span>
    );
  if (s.kind === 'saving' || waiting)
    return (
      <span className="sm-lagra sm-lagrar" role="status">
        <i />
        Lagrar …
      </span>
    );
  return (
    <span className="sm-lagra" role="status">
      <i />
      {s.at ? `Lagra ${clock(s.at)}` : 'Alt er lagra'}
    </span>
  );
}

/** A field another screen changed while this one had it open: keep mine (what the field shows, typing
 * included) or take theirs. */
export function Konflikt({ store, field }: { store: Lagring; field: FieldKey }) {
  const c = store.conflicts.get(field);
  if (!c) return null;
  const theirs = field.endsWith(':rating')
    ? c.theirs
      ? RATING[c.theirs as Rating].word
      : 'ingen vurdering'
    : c.theirs || 'tomt felt';
  return (
    <div className="sm-konflikt" role="alert">
      <p>
        <b>{c.by ?? 'Nokon'} har endra dette feltet på ein annan skjerm.</b> Der står no: «{theirs}
        ». {field.endsWith(':rating') ? 'Vurderinga di' : 'Teksten din'} står her til du har valt.
      </p>
      <div className="knappar">
        <button type="button" className="btn sm" onClick={() => store.resolve(field, 'mine')}>
          Behald mitt
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => store.resolve(field, 'theirs')}
        >
          Bruk deira
        </button>
      </div>
    </div>
  );
}

/** A password or key typed by mistake: say so at once, the text is still the person's to remove. */
export function looksSecret(s: string) {
  return (
    /(passord|password|pwd|pin-?kode)\s*(er|:|=)\s*\S{3,}/i.test(s) ||
    /\b(?=\S*\d)(?=\S*[a-zæøå])(?=\S*[A-ZÆØÅ])(?=\S*[^\sA-Za-z0-9æøåÆØÅ])\S{8,}\b/.test(s)
  );
}

export function Sporsmalskort(p: {
  q: GuideQuestion;
  n: number;
  total: number;
  store: Lagring;
  readOnly: boolean;
  focusOnShow: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { q, store, readOnly } = p;
  const id = useId();
  const key = (f: string) => `${q.id}:${f}`;
  const answer = store.text(key('answer'));
  const action = store.text(key('action'));
  const note = store.text(key('note'));
  const rating = store.rating(q.id);
  const [noteOpen, setNoteOpen] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (p.focusOnShow && !readOnly) answerRef.current?.focus({ preventScroll: true });
  }, [q.id]);
  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);
  const rate = (r: Rating) => {
    if (!readOnly) store.set(key('rating'), rating === r ? null : r);
  };
  const focusR = SCALE.includes(rating as Rating) ? rating : 'ivaretatt';
  const arrows = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir || e.altKey) return;
    e.preventDefault();
    const at = SCALE.indexOf(rating && SCALE.includes(rating) ? rating : 'ivaretatt');
    const next = SCALE[(at + dir + SCALE.length) % SCALE.length]!;
    if (!readOnly) store.set(key('rating'), next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-r="${next}"]`)?.focus();
  };
  const last = p.n === p.total;
  return (
    <article className="sm-kort" aria-labelledby={`${id}-q`}>
      <p className="eyebrow">
        Spørsmål {p.n} av {p.total}
        {q.section ? ` · ${q.section}` : ''}
      </p>
      <h2 className="sm-q" id={`${id}-q`}>
        {q.text}
      </h2>
      {q.help && (
        <details className="sm-hjelp">
          <summary>
            <Icon name="lyspare" small />
            Rettleiing til deg
            <Icon name="chev" small />
          </summary>
          <p>{q.help}</p>
        </details>
      )}
      <label className="sm-label" htmlFor={`${id}-svar`}>
        Kva seier kunden?
      </label>
      <textarea
        id={`${id}-svar`}
        ref={answerRef}
        className="input sm-ta sm-ta-svar"
        maxLength={MAX}
        value={answer}
        readOnly={readOnly}
        placeholder="Skriv med eigne ord det kunden fortel …"
        onChange={(e) => store.set(key('answer'), e.target.value)}
      />
      <Konflikt store={store} field={key('answer')} />
      {looksSecret(answer) && (
        <p className="sm-passord" role="alert">
          <Icon name="varsel" small />
          Ser ut som eit passord. Ikkje skriv passord eller nøklar i Varde.
        </p>
      )}
      <div className="sm-label" id={`${id}-vurdering`}>
        Vurdering
      </div>
      <div
        className="sm-skala"
        role="radiogroup"
        aria-labelledby={`${id}-vurdering`}
        onKeyDown={arrows}
      >
        {SCALE.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            data-r={r}
            aria-checked={rating === r}
            aria-disabled={readOnly || undefined}
            tabIndex={r === focusR ? 0 : -1}
            className={`sm-val sm-val-${RATING[r].cls}`}
            onClick={() => rate(r)}
          >
            <Mark rating={r} />
            <span>{RATING[r].word}</span>
            <kbd>
              {MOD}
              {RATING[r].key}
            </kbd>
          </button>
        ))}
      </div>
      <div className="sm-skala-meir">
        <button
          type="button"
          className={rating === 'ikkje_aktuelt' ? 'linkbtn on' : 'linkbtn'}
          aria-pressed={rating === 'ikkje_aktuelt'}
          disabled={readOnly}
          onClick={() => rate('ikkje_aktuelt')}
        >
          Ikkje aktuelt
        </button>
        <span>
          Tel ikkje med i oversikta<span className="sm-tast"> · {MOD}0</span>
        </span>
      </div>
      <Konflikt store={store} field={key('rating')} />
      <div className="sm-label">
        <label htmlFor={`${id}-tiltak`}>Konklusjon og tiltak</label>
        <span className="sm-hint" id={`${id}-tiltak-h`}>
          Kjem med i referatet til kunden
        </span>
      </div>
      <textarea
        id={`${id}-tiltak`}
        aria-describedby={`${id}-tiltak-h`}
        className="input sm-ta sm-ta-kort"
        maxLength={MAX}
        value={action}
        readOnly={readOnly}
        placeholder="Kva bør gjerast? Til dømes «Ta det inn i arbeidsavtalen»."
        onChange={(e) => store.set(key('action'), e.target.value)}
      />
      <Konflikt store={store} field={key('action')} />
      {note || noteOpen || store.conflicts.has(key('note')) ? (
        <>
          <div className="sm-label">
            <Icon name="las" small />
            <label htmlFor={`${id}-notat`}>Eige notat</label>
            <span className="sm-hint" id={`${id}-notat-h`}>
              Berre for Vardahei, kjem ikkje i referatet
            </span>
          </div>
          <textarea
            id={`${id}-notat`}
            ref={noteRef}
            aria-describedby={`${id}-notat-h`}
            className="input sm-ta sm-ta-kort sm-ta-notat"
            maxLength={MAX}
            value={note}
            readOnly={readOnly}
            placeholder="Inntrykk, ting å sjekke, idear til tilbod …"
            onChange={(e) => store.set(key('note'), e.target.value)}
          />
          <Konflikt store={store} field={key('note')} />
        </>
      ) : (
        <button
          type="button"
          className="linkbtn sm-nytt-notat"
          disabled={readOnly}
          onClick={() => setNoteOpen(true)}
        >
          <Icon name="pluss" small />
          Eige notat
        </button>
      )}
      <div className="sm-fot">
        <button type="button" className="btn ghost" disabled={p.n === 1} onClick={p.onPrev}>
          <Icon name="tilbake" small />
          Førre
        </button>
        <span className="sm-snarveg">
          <kbd>{MOD}↑</kbd>
          <kbd>{MOD}↓</kbd> førre og neste
        </span>
        <button type="button" className="btn primary" onClick={p.onNext}>
          {last ? 'Til oppsummeringa' : 'Neste'}
          <Icon name="pil" small />
        </button>
      </div>
    </article>
  );
}
