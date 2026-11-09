// «Personvern › Kontaktar» (2.17; on «Seminar» before): the contacts that wait for the yearly check.
// The names load only on request, through the privacy module, and each confirmation is logged.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { shortDate } from './norsk.js';
import { ErrorMessage } from './queries.js';
import type { ContactReview, SeminarList } from './seminar-models.js';
import './kundar.css';

export function KontaktSjekk() {
  const queries = useQueryClient();
  // The yearly check over many contacts (wave B): fifty marked contacts were fifty presses.
  const [valde, setValde] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ['seminars', 'list'],
    queryFn: () => api<SeminarList>('/api/admin/seminars'),
  });
  const count = list.data?.contacts_to_review ?? 0;
  const [rows, setRows] = useState<ContactReview[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  /** One press, one or many: the same audited confirmation per contact. */
  const confirmMany = async (ids: readonly string[]) => {
    setBusy(true);
    setError(null);
    try {
      await mutate('/api/admin/contacts/confirm', 'POST', { contacts: ids });
      setRows((old) => old?.filter((x) => !ids.includes(x.id)) ?? null);
      setValde((old) => old.filter((x) => !ids.includes(x)));
      await queries.invalidateQueries({ queryKey: ['seminars'] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  };
  const load = async () => {
    try {
      setRows((await api<{ rows: ContactReview[] }>('/api/admin/contacts/review')).rows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    }
  };
  return (
    <section className="del smal sem-kontaktar" aria-labelledby="kontakt-tittel">
      <h2 id="kontakt-tittel">Den årlege sjekken</h2>
      <p>
        {!list.data
          ? 'Hentar kontaktane …'
          : count === 0
            ? 'Ingen kontaktar ventar på den årlege sjekken.'
            : `${count} ${count === 1 ? 'kontakt ventar' : 'kontaktar ventar'} på den årlege sjekken.`}
      </p>
      <p className="forklaring">
        Ein kontakt utan påmelding og utan samtykke til invitasjonar blir sletta av seg sjølv. Ein
        gong i året sjekkar de at samarbeidet og samtykket framleis gjeld. Slett ein kontakt under
        «Sletting».
      </p>
      {count > 0 && rows === null && (
        <div className="handlingar">
          <button type="button" className="btn sm" onClick={() => void load()}>
            Vis kontaktane
          </button>
        </div>
      )}
      {rows && rows.length > 1 && (
        <div className="handlingar sjekk-alle">
          <button
            type="button"
            className="btn sm"
            onClick={() => setValde(valde.length === rows.length ? [] : rows.map((c) => c.id))}
          >
            {valde.length === rows.length ? 'Vel ingen' : `Vel alle (${rows.length})`}
          </button>
          <button
            type="button"
            className="btn sm primary"
            disabled={busy || valde.length === 0}
            onClick={() => void confirmMany(valde)}
          >
            Stadfest {valde.length} valde
          </button>
        </div>
      )}
      {rows && (
        <ul className="sem-sjekk">
          {rows.map((c) => (
            <li key={c.id}>
              <label className="kryss sjekk-kryss">
                <input
                  type="checkbox"
                  checked={valde.includes(c.id)}
                  aria-label={`Vel ${c.name}`}
                  onChange={(e) =>
                    setValde(e.target.checked ? [...valde, c.id] : valde.filter((x) => x !== c.id))
                  }
                />
                <span>
                  <b>{c.name}</b>
                  <small>
                    {c.company} · {c.email} · sist sjekka {shortDate(c.last_confirmed_at)}
                  </small>
                </span>
              </label>
              <button
                type="button"
                className="btn sm"
                disabled={busy}
                onClick={() => void confirmMany([c.id])}
              >
                Stadfest
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorMessage error={error ?? list.error} />
    </section>
  );
}
