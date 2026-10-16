// «Materiell» of a seminar (3.3): titles and links (no uploads) that the participants see on the
// registration page once the seminar is over.
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import { ErrorMessage } from './queries.js';
import type { SeminarDetail } from './seminar-models.js';

const host = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function Materials({ seminar }: { seminar: SeminarDetail }) {
  const queries = useQueryClient();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const items = seminar.materials ?? [];
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await queries.invalidateQueries({ queryKey: ['seminars'] });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run(() => mutate(`/api/admin/seminars/${seminar.id}/materials`, 'POST', { title, url }))) {
      setTitle('');
      setUrl('');
    }
  }
  return (
    <div className="flate">
      <section className="kort s7">
        <div className="kort-hovud">
          <h2>Materiell</h2>
          <span className={seminar.status === 'held' ? 'chip ok' : 'chip'}>
            {seminar.status === 'held' ? 'Synleg for deltakarane' : 'Synleg etter seminaret'}
          </span>
        </div>
        <div className="kort-innhald">
          {items.length === 0 ? (
            <p className="tom">Ikkje noko materiell enno.</p>
          ) : (
            <ul className="sem-materiell-liste">
              {items.map((m) => (
                <li key={m.id}>
                  <Icon name="dok" />
                  <span>
                    <a href={m.url} target="_blank" rel="noopener noreferrer">
                      {m.title}
                    </a>
                    <small>{host(m.url)}</small>
                  </span>
                  <button
                    type="button"
                    className="btn sm ghost"
                    disabled={busy}
                    aria-label={`Fjern ${m.title}`}
                    onClick={() =>
                      void run(() => mutate(`/api/admin/seminars/${seminar.id}/materials/${m.id}`, 'DELETE'))
                    }
                  >
                    Fjern
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="forklaring">
            Deltakarane finn lysark og lenkjer på påmeldingssida når seminaret er over. Alle som har
            lenkja til sida, ser dei, så legg ikkje ut noko som ikkje kan delast.
          </p>
        </div>
      </section>
      <section className="kort s5">
        <div className="kort-hovud">
          <h2>Legg til</h2>
        </div>
        <div className="kort-innhald">
          <form className="sem-form" onSubmit={(e) => void add(e)}>
            <fieldset disabled={busy}>
              <label className="field">
                <span>Tittel</span>
                <input className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="field">
                <span>Lenkje</span>
                <input
                  className="input"
                  type="url"
                  required
                  maxLength={2000}
                  placeholder="https://"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <ErrorMessage error={error} />
              <div className="handlingar">
                <button type="submit" className="btn primary sm">
                  Legg til materiell
                </button>
              </div>
            </fieldset>
          </form>
        </div>
      </section>
    </div>
  );
}
