// The contacts of one client on its page (2.17): how many first, then names and e-mail only on
// request, through the privacy module, and each read is written to the log — as «Personvern ›
// Kontaktar». The names live in this card while it is open, never in the query cache.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { Icon } from './icons.js';
import type { Client } from './models.js';
import { follow } from './nav.js';
import { ErrorMessage } from './queries.js';
import { shortDate } from './seminar-models.js';

export interface ClientContact {
  id: string;
  name: string;
  email: string;
  role: string | null;
  /** Has said yes to invitations to later seminars. */
  invite: boolean;
  last_confirmed_at: string;
  /** Waits for the yearly check. */
  review: boolean;
  seminars: { id: string; topic: string; starts_at: string }[];
}

export const contactCount = (n: number) => `${n} ${n === 1 ? 'kontakt' : 'kontaktar'}`;

export function KundeKontaktar({ client }: { client: Client }) {
  const count = useQuery({
    queryKey: ['seminars', 'client-contacts', client.id],
    queryFn: () =>
      api<{ total: number; review: number }>(`/api/admin/clients/${client.id}/contacts/count`),
  });
  const [rows, setRows] = useState<ClientContact[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(
        (await api<{ rows: ClientContact[] }>(`/api/admin/clients/${client.id}/contacts`)).rows,
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  };
  const total = count.data?.total ?? 0,
    review = count.data?.review ?? 0;
  return (
    <section className="kort" aria-labelledby="kunde-kontaktar">
      <div className="kort-hovud">
        <h2 id="kunde-kontaktar">Kontaktar</h2>
      </div>
      <div className="kort-innhald kontakt-kort">
        <p role="status">
          {!count.data
            ? 'Hentar kontaktane …'
            : total === 0
              ? `Ingen kontaktar hos ${client.name} enno.`
              : `${contactCount(total)} hos ${client.name}.`}
        </p>
        {review > 0 && (
          <a
            className="lenkje"
            href="/admin/personvern/kontaktar"
            onClick={(e) => follow(e, '/admin/personvern/kontaktar')}
          >
            {review} ventar på den årlege sjekken
            <Icon name="pil" small />
          </a>
        )}
        <p className="forklaring">
          Kontaktane kjem frå påmeldingar til seminar. Lista har namn og e-post. Kvar gong nokon
          opnar ho, blir det skrive i loggen.
        </p>
        {total > 0 && rows === null && (
          <div className="handlingar">
            <button type="button" className="btn sm" disabled={busy} onClick={() => void load()}>
              Vis kontaktane
            </button>
          </div>
        )}
        {rows && (
          <>
            {rows.length === 0 ? (
              <p className="under">Ingen kontaktar å vise no.</p>
            ) : (
              <ul className="rom-liste kontakt-liste">
                {rows.map((c) => (
                  <li key={c.id}>
                    <span className="kontakt-namn">
                      <b>{c.name}</b>
                      {c.review && <span className="chip warn">Årleg sjekk</span>}
                    </span>
                    <small>
                      <a href={`mailto:${c.email}`}>{c.email}</a>
                      {c.role ? ` · ${c.role}` : ''} · invitasjonar: {c.invite ? 'ja' : 'nei'} ·
                      sist sjekka {shortDate(c.last_confirmed_at)}
                    </small>
                    {c.seminars.length > 0 && (
                      <small>
                        Påmeld:{' '}
                        {c.seminars.map((s, i) => (
                          <span key={s.id}>
                            {i > 0 && ', '}
                            <a
                              href={`/admin/seminars/${s.id}`}
                              onClick={(e) => follow(e, `/admin/seminars/${s.id}`)}
                            >
                              {s.topic}
                            </a>{' '}
                            ({shortDate(s.starts_at)})
                          </span>
                        ))}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="handlingar">
              <button type="button" className="btn sm ghost" onClick={() => setRows(null)}>
                Skjul kontaktane
              </button>
            </div>
          </>
        )}
        <ErrorMessage error={error ?? count.error} />
      </div>
    </section>
  );
}
