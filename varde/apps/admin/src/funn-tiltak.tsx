// «Tiltakskatalog» under the rules on «Skjema → Funn-reglar» (2.22b): the actions Vardahei can propose,
// each with the seminar topic it leads to (the Action of 3.1, which had only an API), and «Nytt tiltak».
// A conversation chooses from it under «Konklusjon og tiltak»; Oversikt groups by it; the client page
// follows the chosen ones up under «Funn». A new action is in AuditLog (`findings.action.create`). The
// catalogue has no editing or deleting: an action chosen in a conversation stays (RESTRICT).
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import { ErrorMessage } from './queries.js';
import { useCatalog } from './samtale-tiltak.js';
import { useToast } from './shell.js';
import './samtale-tiltak.css';

function NyttTiltak({ onDone }: { onDone: (saved: boolean) => void }) {
  const id = useId();
  const queries = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const missing = [
    !name.trim() && 'namn',
    !description.trim() && 'kva tiltaket går ut på',
    !topic.trim() && 'seminartema',
  ].filter(Boolean);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    // Said in words, not by a button that stays grey (WCAG 3.3.1).
    if (missing.length) {
      setError(new Error(`Skriv ${missing.join(', ').replace(/, ([^,]*)$/, ' og $1')}.`));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mutate('/api/admin/actions', 'POST', {
        name: name.trim(),
        description: description.trim(),
        seminar_topic: topic.trim(),
      });
      await queries.invalidateQueries({ queryKey: ['tiltak', 'katalog'] });
      toast('Tiltaket er lagt i katalogen.');
      onDone(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="tk-skjema" aria-label="Nytt tiltak" noValidate onSubmit={(e) => void save(e)}>
      <label className="field" htmlFor={`${id}-namn`}>
        <span>Namn</span>
        <input
          id={`${id}-namn`}
          ref={first}
          className="input"
          aria-required="true"
          maxLength={120}
          value={name}
          placeholder="Til dømes «Phishing-øving»"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field" htmlFor={`${id}-kva`}>
        <span>Kva går tiltaket ut på?</span>
        <textarea
          id={`${id}-kva`}
          className="input"
          aria-required="true"
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="field" htmlFor={`${id}-tema`}>
        <span>Seminartema</span>
        <input
          id={`${id}-tema`}
          className="input"
          aria-required="true"
          maxLength={160}
          value={topic}
          placeholder="Til dømes «Phishing og svindel»"
          onChange={(e) => setTopic(e.target.value)}
        />
      </label>
      <ErrorMessage error={error} />
      <div className="tk-knappar">
        <button type="submit" className="btn sm primary" disabled={busy}>
          Lagre tiltaket
        </button>
        <button type="button" className="btn sm" disabled={busy} onClick={() => onDone(false)}>
          Avbryt
        </button>
      </div>
    </form>
  );
}

export function Tiltakskatalog() {
  const catalog = useCatalog();
  const list = Array.isArray(catalog.data) ? catalog.data : [];
  const [adding, setAdding] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLElement>(null);
  const back = useRef(false);
  // «Til katalogen» from a conversation with an empty catalogue lands here. The rules and the editor above
  // arrive after the card and push it down: it is kept at the top until the person scrolls or 1.5 s
  // pass, as the client page keeps «Funn».
  useEffect(() => {
    const el = card.current;
    if (window.location.hash !== '#tiltakskatalog' || !el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'start' });
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => el.scrollIntoView({ block: 'start' }));
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    const stop = () => {
      observer.disconnect();
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, stop);
    };
    const timer = setTimeout(stop, 1500);
    for (const e of events) window.addEventListener(e, stop, { passive: true });
    observer.observe(document.body);
    return stop;
  }, []);
  useEffect(() => {
    if (adding || !back.current) return;
    back.current = false;
    opener.current?.focus();
  }, [adding]);
  return (
    <section
      ref={card}
      id="tiltakskatalog"
      className="kort tiltakskatalog"
      aria-labelledby="tiltakskatalog-h"
      tabIndex={-1}
    >
      <div className="kort-hovud">
        <h2 id="tiltakskatalog-h">Tiltakskatalog</h2>
        <span className="muted">{catalog.data ? `${list.length} tiltak` : 'Hentar …'}</span>
      </div>
      <div className="kort-innhald">
        <p className="forklaring">
          Tiltak Vardahei kan føreslå, kvart med seminartemaet det høyrer til. I samtalane vel du
          dei under «Konklusjon og tiltak». Oversikta samlar dei, og kundesida følgjer dei opp under
          «Funn».
        </p>
        <ErrorMessage error={catalog.error} />
        {catalog.data && !list.length && <p className="under">Katalogen er tom enno.</p>}
        {list.length > 0 && (
          <ul className="tk-liste">
            {list.map((a) => (
              <li key={a.id}>
                <b>{a.name}</b>
                <span className="chip">
                  <span className="sr-only">Seminartema: </span>
                  {a.seminar_topic}
                </span>
                <p>{a.description}</p>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <NyttTiltak
            onDone={() => {
              back.current = true;
              setAdding(false);
            }}
          />
        ) : (
          <button
            ref={opener}
            type="button"
            className="btn sm tk-ny"
            onClick={() => setAdding(true)}
          >
            <Icon name="pluss" small />
            Nytt tiltak
          </button>
        )}
      </div>
    </section>
  );
}
