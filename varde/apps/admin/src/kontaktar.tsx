// «Personvern › Kontaktar» (2.17; on «Seminar» before): the contacts that wait for the yearly check.
// The names load only on request, through the privacy module, and each confirmation is logged.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { ErrorMessage } from './queries.js';
import { type ContactReview, type SeminarList, shortDate } from './seminar-models.js';

export function KontaktSjekk() {
  const queries = useQueryClient();
  const list = useQuery({
    queryKey: ['seminars', 'list'],
    queryFn: () => api<SeminarList>('/api/admin/seminars'),
  });
  const count = list.data?.contacts_to_review ?? 0;
  const [rows, setRows] = useState<ContactReview[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
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
      {rows && (
        <ul className="sem-sjekk">
          {rows.map((c) => (
            <li key={c.id}>
              <span>
                <b>{c.name}</b>
                <small>
                  {c.company} · {c.email} · sist sjekka {shortDate(c.last_confirmed_at)}
                </small>
              </span>
              <button
                type="button"
                className="btn sm"
                onClick={() =>
                  void mutate(`/api/admin/contacts/${c.id}/confirm`).then(async () => {
                    setRows((old) => old?.filter((x) => x.id !== c.id) ?? null);
                    await queries.invalidateQueries({ queryKey: ['seminars'] });
                  }, setError)
                }
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
