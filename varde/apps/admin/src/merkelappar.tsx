// Free tags on a client (wave A, decision of Oleksandr 09.11): «IT», «BIO». They are what a
// campaign tells its cohorts apart by — in the client list and wherever clients are picked — so
// they are written in one place and read in many. Stored in lower case; each one once.
import { useState, type KeyboardEvent } from 'react';
import { Icon } from './icons.js';
import type { Client } from './models.js';
import { byNorsk } from './norsk.js';
import './kundar.css';

/** Every tag in use, in Norwegian order: what the filters offer and the field suggests. */
export const tagsOf = (clients: readonly Client[]): string[] =>
  [...new Set(clients.flatMap((c) => c.tags))].sort(byNorsk);

const clean = (t: string) => t.trim().toLocaleLowerCase('nb').slice(0, 24);

/** The tags of one client, as they are shown in a list. */
export function Merkelappar({ tags }: { tags: readonly string[] }) {
  if (!tags.length) return null;
  return (
    <span className="merkelappar">
      {tags.map((t) => (
        <span key={t} className="chip accent">
          {t}
        </span>
      ))}
    </span>
  );
}

/** The tags of a client while they are being changed: Enter adds, the cross takes one away. */
export function MerkelappFelt({
  value,
  known,
  onChange,
}: {
  value: readonly string[];
  /** Tags already in use, offered while typing. */
  known: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const [text, setText] = useState('');
  const full = value.length >= 6;
  function add() {
    const tag = clean(text);
    if (!tag || value.includes(tag)) return setText('');
    onChange([...value, tag]);
    setText('');
  }
  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' && e.key !== ',') return;
    // Enter in a tag field adds the tag; it never sends the form around it.
    e.preventDefault();
    add();
  }
  return (
    <div className="merke-felt">
      <span className="merke-tittel" id="merke-tittel">
        Merkelappar
      </span>
      {value.length > 0 && (
        <span className="merkelappar">
          {value.map((t) => (
            <span key={t} className="chip accent">
              {t}
              <button
                type="button"
                className="merke-bort"
                aria-label={`Ta bort merkelappen ${t}`}
                onClick={() => onChange(value.filter((x) => x !== t))}
              >
                <Icon name="lukk" small />
              </button>
            </span>
          ))}
        </span>
      )}
      <div className="merke-nytt">
        <input
          className="input"
          list="merkelapp-liste"
          maxLength={24}
          disabled={full}
          placeholder={full ? 'Seks merkelappar er nok' : 'IT, BIO …'}
          aria-label="Ny merkelapp"
          aria-describedby="merke-hjelp"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={key}
          onBlur={add}
        />
        <datalist id="merkelapp-liste">
          {known
            .filter((t) => !value.includes(t))
            .map((t) => (
              <option key={t} value={t} />
            ))}
        </datalist>
        <button type="button" className="btn sm" disabled={full || !clean(text)} onClick={add}>
          Legg til
        </button>
      </div>
      <p className="forklaring" id="merke-hjelp">
        Skriv ein merkelapp og trykk Enter. Du filtrerer kundelista på dei, og vel heile merkelappen
        når du plukkar kundar til ei runde eller eit seminar.
      </p>
    </div>
  );
}
