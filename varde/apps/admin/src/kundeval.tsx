// Picking clients, in one place (wave A). Before this each screen had its own list: the wizard of
// a round and the seminar form showed all clients as a flat column with no search, while the round
// of conversations had a search of its own. With 48 clients that column is four screens long. Here
// every screen gets the same thing: a search, the tags as filters, and «Vel alle» over what the
// filter shows — so «all the IT clients» is two presses.
import { useId, useState, type ReactNode } from 'react';
import type { Client } from './models.js';
import { byNorsk, flatNorsk } from './norsk.js';
import { tagsOf } from './merkelappar.js';
import './kundar.css';

export function Kundeval({
  clients,
  chosen,
  onChange,
  legend,
  extra,
}: {
  clients: readonly Client[];
  chosen: readonly string[];
  onChange: (next: string[]) => void;
  legend: string;
  /** Fields that belong to one picked client, such as its deadline in a round. */
  extra?: (client: Client) => ReactNode;
}) {
  const id = useId();
  const [find, setFind] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  // An archived client (wave B) is not picked for anything new; it is already picked where it was.
  const live = clients.filter((c) => c.archived_at === null || chosen.includes(c.id));
  const tags = tagsOf(live);
  const words = flatNorsk(find.trim());
  const shown = [...live]
    .filter((c) => (tag === null || c.tags.includes(tag)) && flatNorsk(c.name).includes(words))
    .sort((a, b) => byNorsk(a.name, b.name));
  const picked = new Set(chosen);
  const allShown = shown.length > 0 && shown.every((c) => picked.has(c.id));
  // A filter must never hide a choice without saying so: what is picked still counts.
  const hidden = chosen.length - shown.filter((c) => picked.has(c.id)).length;
  const toggle = (client: string, on: boolean) =>
    onChange(on ? [...chosen, client] : chosen.filter((x) => x !== client));
  return (
    <fieldset className="kval">
      <legend>
        {legend} <span className="kval-tal">{chosen.length} valde</span>
      </legend>
      <div className="kval-sok">
        <input
          className="input"
          type="search"
          placeholder="Finn kunde"
          aria-label="Finn kunde"
          value={find}
          onChange={(e) => setFind(e.target.value)}
        />
      </div>
      {tags.length > 0 && (
        <div className="seg kval-merke" role="group" aria-label="Merkelappar">
          <button type="button" aria-pressed={tag === null} onClick={() => setTag(null)}>
            Alle
          </button>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tag === t}
              onClick={() => setTag(tag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="kval-knappar">
        <button
          type="button"
          className="btn sm"
          disabled={!shown.length || allShown}
          onClick={() => onChange([...new Set([...chosen, ...shown.map((c) => c.id)])])}
        >
          {tag === null && !words ? 'Vel alle' : `Vel alle viste (${shown.length})`}
        </button>
        <button
          type="button"
          className="btn sm ghost"
          disabled={!chosen.length}
          onClick={() => onChange([])}
        >
          Vel ingen
        </button>
      </div>
      <div className="kval-liste">
        {shown.map((c) => (
          <div className="kval-kunde" key={c.id}>
            <label className="kryss">
              <input
                type="checkbox"
                checked={picked.has(c.id)}
                onChange={(e) => toggle(c.id, e.target.checked)}
              />
              <span className="kval-namn">
                {c.name}
                {c.tags.length > 0 && <small>{c.tags.join(' · ')}</small>}
              </span>
            </label>
            {picked.has(c.id) && extra && <div className="kval-meir">{extra(c)}</div>}
          </div>
        ))}
        {hidden > 0 && (
          <p className="forklaring" role="status">
            {hidden === 1 ? 'Éin vald kunde er' : `${hidden} valde kundar er`} ikkje vist med dette
            filteret, men er framleis med.
          </p>
        )}
        {!shown.length && (
          <p className="forklaring" id={`${id}-tom`}>
            Ingen kundar passar. Prøv eit anna ord, eller vel «Alle».
          </p>
        )}
      </div>
    </fieldset>
  );
}
