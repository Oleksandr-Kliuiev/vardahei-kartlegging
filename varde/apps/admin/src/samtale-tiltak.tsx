// «Tiltak frå katalogen» under «Konklusjon og tiltak» of a question (2.22b, decision 3.3 of 07.11): the
// actions of the catalogue chosen for this answer as chips that can be taken away, and «Legg til frå
// katalogen», a list to search by name or seminar topic, by keyboard or pointer. The choice is one field
// of the save store (`N12:actions`: the ids, sorted, joined by commas), so it waits for the network,
// meets a change from another screen and goes before «Fullfør» like the text fields. Read only when the
// conversation is finished. With an empty catalogue it says where the actions are made.
import { type KeyboardEvent, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { Icon } from './icons.js';
import { follow } from './nav.js';
import { ErrorMessage } from './queries.js';
import type { Lagring } from './samtale-lagring.js';
import './samtale-tiltak.css';

export interface CatalogAction {
  id: string;
  name: string;
  description: string;
  seminar_topic: string;
}

/** Where the catalogue is kept: «Skjema → Funn-reglar», under the rules (funn-tiltak.tsx). */
export const KATALOG = '/admin/surveys/funn#tiltakskatalog';

/** The catalogue (3.1), read once and kept for the visit: a chip keeps its name when the network goes. */
export const useCatalog = () =>
  useQuery({
    queryKey: ['tiltak', 'katalog'],
    queryFn: () => api<CatalogAction[]>('/api/admin/actions'),
    staleTime: 5 * 60_000,
  });

/** The ids of the field's value, and the value of a set of ids as the server takes it: sorted, each once. */
export const idsOf = (value: string) => (value ? value.split(',') : []);
export const valueOf = (ids: Iterable<string>) => [...new Set(ids)].sort().join(',');

/** The actions whose name or seminar topic has every word searched for, in the catalogue's order. */
export function matches(list: readonly CatalogAction[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((a) => {
    const text = `${a.name} ${a.seminar_topic}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** The list to choose from: a search field that leads a list of the catalogue (a combobox with a
 * listbox that takes several). The arrows move in the list from the search field, and in the list itself
 * when Tab took the focus there (Home, End and Space too); Enter or a click takes an action or takes it
 * away again. Escape and «Ferdig» close it and give the focus back to «Legg til frå katalogen»; a press
 * outside closes it. */
function Velg({
  id,
  list,
  chosen,
  loading,
  error,
  opener,
  onToggle,
  onClose,
}: {
  id: string;
  list: readonly CatalogAction[];
  chosen: readonly string[];
  loading: boolean;
  error: Error | null;
  opener: RefObject<HTMLButtonElement | null>;
  onToggle: (id: string) => void;
  onClose: (back: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const hits = matches(list, query);
  const active = hits[Math.min(at, hits.length - 1)];
  const option = (a: CatalogAction) => `${id}-${a.id}`;
  // The search takes the focus, and the whole list comes into view (on a phone it opens low on the page).
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    box.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  useEffect(() => {
    if (active) document.getElementById(option(active))?.scrollIntoView?.({ block: 'nearest' });
  }, [active?.id]);
  // A press outside closes the list where it is; the focus stays with what was pressed. The button that
  // opened it closes it by its own click.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !opener.current?.contains(t)) close.current(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [opener]);
  const keys = (e: KeyboardEvent<HTMLElement>, inList = false) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowDown') setAt(Math.min(at + 1, hits.length - 1));
    else if (e.key === 'ArrowUp') setAt(Math.max(at - 1, 0));
    else if (inList && e.key === 'Home') setAt(0);
    else if (inList && e.key === 'End') setAt(hits.length - 1);
    else if ((e.key === 'Enter' || (inList && e.key === ' ')) && active) onToggle(active.id);
    else if (e.key === 'Escape') onClose(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div className="sm-katalog-val" id={id} ref={box}>
      <div className="sm-katalog-sok">
        <Icon name="sok" small />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Søk i katalogen"
          aria-expanded="true"
          aria-controls={`${id}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={active ? option(active) : undefined}
          autoComplete="off"
          placeholder="Søk på namn eller tema"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => keys(e)}
        />
      </div>
      <ul
        className="sm-katalog-liste"
        id={`${id}-liste`}
        role="listbox"
        aria-multiselectable="true"
        aria-label="Tiltak i katalogen"
        aria-activedescendant={active ? option(active) : undefined}
        tabIndex={0}
        onKeyDown={(e) => keys(e, true)}
      >
        {hits.map((a) => {
          const on = chosen.includes(a.id);
          return (
            <li
              key={a.id}
              id={option(a)}
              role="option"
              aria-selected={on}
              className={a.id === active?.id ? 'sm-katalog-aktiv' : undefined}
              onPointerDown={(e) => e.preventDefault()}
              // The pointer moves the place only when it moves: a list under a resting pointer
              // must not take the keyboard's place.
              onMouseMove={() => setAt(hits.indexOf(a))}
              onClick={() => onToggle(a.id)}
            >
              <span className="sm-katalog-hake" aria-hidden="true">
                {on && <Icon name="hake" small />}
              </span>
              <span className="sm-katalog-namn">
                <b>{a.name}</b>
                <small>Seminartema: {a.seminar_topic}</small>
              </span>
            </li>
          );
        })}
      </ul>
      <ErrorMessage error={error} />
      {loading && <p role="status">Hentar katalogen …</p>}
      {!loading && !error && !hits.length && (
        <p role="status" className="sm-katalog-ingen">
          Ingen tiltak i katalogen passar til «{query.trim()}».
        </p>
      )}
      <div className="sm-katalog-fot">
        <span role="status">
          {query.trim() ? `${hits.length} treff · ` : ''}
          {chosen.length === 0
            ? 'ingen valde'
            : chosen.length === 1
              ? '1 valt'
              : `${chosen.length} valde`}
        </span>
        <button type="button" className="btn sm" onClick={() => onClose(true)}>
          Ferdig
        </button>
      </div>
    </div>
  );
}

/** A point of «Dette bør de sjå på» on the summary: the conclusion, the names of the actions of the
 * catalogue chosen for it, or that nothing is written. */
export function PunktTiltak({ store, question }: { store: Lagring; question: string }) {
  const catalog = useCatalog();
  const text = store.text(`${question}:action`);
  const names = idsOf(store.text(`${question}:actions`)).map(
    (a) => catalog.data?.find((x) => x.id === a)?.name ?? 'Tiltak frå katalogen',
  );
  if (!text.trim() && !names.length) return <em>Ingen tiltak skrive</em>;
  return (
    <>
      {text.trim() && <span>{text}</span>}
      {names.length > 0 && (
        <span className="sm-punkt-katalog" role="list" aria-label="Tiltak frå katalogen">
          {names.map((n, i) => (
            <span key={`${n}-${i}`} role="listitem" className="chip accent">
              {n}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

export function KatalogTiltak({
  store,
  question,
  readOnly,
}: {
  store: Lagring;
  question: string;
  readOnly: boolean;
}) {
  const key = `${question}:actions`;
  const id = useId();
  const catalog = useCatalog();
  const list = Array.isArray(catalog.data) ? catalog.data : [];
  const byId = new Map(list.map((a) => [a.id, a]));
  const chosen = idsOf(store.text(key));
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const chips = useRef<HTMLUListElement>(null);
  // After a chip is taken away the focus goes to the next one (or the one before, or «Legg til»).
  const [refocus, setRefocus] = useState<number | null>(null);
  const back = useRef(false);
  useEffect(() => {
    if (open || !back.current) return;
    back.current = false;
    opener.current?.focus();
  }, [open]);
  useEffect(() => {
    if (refocus === null) return;
    const left = chips.current?.querySelectorAll<HTMLButtonElement>('button');
    (left?.[Math.min(refocus, left.length - 1)] ?? opener.current)?.focus();
    setRefocus(null);
  }, [refocus]);
  const name = (a: string) =>
    byId.get(a)?.name ??
    (catalog.isPending ? 'Hentar …' : catalog.isError ? 'Tiltak' : 'Ukjent tiltak');
  // The chips in the order of their names: the stored order is the order of the ids.
  const shown = [...chosen].sort((a, b) => name(a).localeCompare(name(b), 'nn'));
  const toggle = (a: string) =>
    store.set(key, valueOf(chosen.includes(a) ? chosen.filter((x) => x !== a) : [...chosen, a]));
  const conflict = store.conflicts.get(key);
  const empty = catalog.isSuccess && list.length === 0;
  return (
    <div className="sm-katalog" role="group" aria-labelledby={`${id}-k`}>
      <div className="sm-label sm-katalog-label">
        <span id={`${id}-k`}>Tiltak frå katalogen</span>
        <span className="sm-hint">Valfritt · blir følgt opp på kundesida</span>
      </div>
      {chosen.length > 0 && (
        <ul className="sm-katalog-chips" ref={chips} aria-label="Valde tiltak">
          {shown.map((a, n) => (
            <li key={a} className="sm-katalog-chip" title={byId.get(a)?.seminar_topic}>
              <span>{name(a)}</span>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Fjern ${name(a)}`}
                  onClick={() => {
                    toggle(a);
                    setRefocus(n);
                  }}
                >
                  <Icon name="lukk" small />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? (
        !chosen.length && <p className="sm-katalog-tom">Ingen tiltak frå katalogen er valde.</p>
      ) : empty && !chosen.length ? (
        <p className="sm-katalog-tom">
          Katalogen er tom. Tiltak lagar du under Skjema → Funn-reglar.{' '}
          <a href={KATALOG} onClick={(e) => follow(e, KATALOG)}>
            Til katalogen
          </a>
        </p>
      ) : (
        <button
          ref={opener}
          type="button"
          className="linkbtn sm-katalog-legg"
          aria-expanded={open}
          aria-controls={open ? `${id}-val` : undefined}
          onClick={() => setOpen(!open)}
        >
          <Icon name="pluss" small />
          Legg til frå katalogen
        </button>
      )}
      {open && !readOnly && (
        <Velg
          id={`${id}-val`}
          opener={opener}
          list={list}
          chosen={chosen}
          loading={catalog.isPending}
          error={catalog.error}
          onToggle={toggle}
          onClose={(focus) => {
            back.current = focus;
            setOpen(false);
          }}
        />
      )}
      {conflict && (
        <div className="sm-konflikt" role="alert">
          <p>
            <b>{conflict.by ?? 'Nokon'} har endra tiltaka på ein annan skjerm.</b> Der står no: «
            {idsOf(conflict.theirs ?? '')
              .map(name)
              .join(', ') || 'ingen tiltak'}
            ». Vala dine står her til du har valt.
          </p>
          <div className="knappar">
            <button type="button" className="btn sm" onClick={() => store.resolve(key, 'mine')}>
              Behald mitt
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => store.resolve(key, 'theirs')}
            >
              Bruk deira
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
