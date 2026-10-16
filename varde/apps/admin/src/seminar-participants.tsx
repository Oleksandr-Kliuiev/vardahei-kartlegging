// «Namneliste» of a seminar (3a): names, companies and e-mail, and whether the person wants
// invitations, read only on request (every read is in the log). The admin corrects a contact here
// and may withdraw its consent to invitations (never give it); the public form never changes a
// known contact, except to add that consent when the person ticks the box (decision 16.10).
import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { ErrorMessage, useClients } from './queries.js';
import { type Participant, type SeminarDetail, shortDate } from './seminar-models.js';

function EditContact({
  row,
  onDone,
  onCancel,
}: {
  row: Participant;
  onDone: (row: Participant) => void;
  onCancel: () => void;
}) {
  const clients = useClients();
  const [name, setName] = useState(row.name);
  const [client, setClient] = useState(row.client ?? '');
  const [company, setCompany] = useState(row.client ? '' : row.company);
  const [withdraw, setWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/admin/contacts/${row.contact}`, 'PUT', {
        name,
        ...(client ? { client } : { company, client: null }),
        ...(withdraw ? { withdraw_invite: true } : {}),
      });
      const chosen = clients.data?.find((c) => c.id === client);
      onDone({
        ...row,
        name: name.trim(),
        client: client || null,
        company: chosen?.name ?? company.trim(),
        invite: row.invite && !withdraw,
      });
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
      setBusy(false);
    }
  }
  return (
    <form className="sem-form sem-kontakt-form" aria-label="Endre kontakten" onSubmit={(e) => void save(e)}>
      <fieldset disabled={busy}>
        <label className="field">
          <span>Namn</span>
          <input className="input" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Kunde</span>
          <select className="input" value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">Anna bedrift</option>
            {clients.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {!client && (
          <label className="field">
            <span>Bedrift</span>
            <input className="input" required maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
        )}
        <div className="field">
          <span>Invitasjonar</span>
          {row.invite ? (
            <label className="kryss">
              <input type="checkbox" checked={withdraw} onChange={(e) => setWithdraw(e.target.checked)} /> Ta bort
              samtykket til invitasjonar
            </label>
          ) : (
            <p className="forklaring">Personen har ikkje sagt ja til invitasjonar.</p>
          )}
        </div>
        <p className="forklaring">
          Endringa gjeld kontakten i alle seminar. E-posten kan ikkje endrast. Samtykket til invitasjonar kan
          berre personen sjølv gi, på påmeldingssida.
        </p>
        <ErrorMessage error={error} />
        <div className="handlingar">
          <button type="submit" className="btn primary sm">
            Lagre kontakten
          </button>
          <button type="button" className="btn ghost sm" onClick={onCancel}>
            Avbryt
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/** «Fjern påmelding» in two presses. A contact left with no registration and no consent to
 * invitations goes in the next daily run; with that consent it stays (yearly check, «Sletting»). */
function RemoveRegistration({
  seminar,
  row,
  onDone,
}: {
  seminar: string;
  row: Participant;
  onDone: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(false), 5000);
    return () => clearTimeout(timer);
  }, [confirm]);
  async function remove() {
    setBusy(true);
    try {
      await mutate(`/api/admin/seminars/${seminar}/registrations/${row.registration}`, 'DELETE');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
      setBusy(false);
      setConfirm(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className={confirm ? 'btn sm danger' : 'btn sm ghost'}
        disabled={busy}
        aria-label={confirm ? `Stadfest: fjern påmeldinga til ${row.name}` : `Fjern påmeldinga til ${row.name}`}
        onClick={() => (confirm ? void remove() : setConfirm(true))}
      >
        {confirm ? 'Stadfest' : 'Fjern påmelding'}
      </button>
      <ErrorMessage error={error} />
    </>
  );
}

export function NameList({ seminar }: { seminar: SeminarDetail }) {
  const queries = useQueryClient();
  const [rows, setRows] = useState<Participant[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const show = async () => {
    setError(null);
    try {
      setRows((await api<{ rows: Participant[] }>(`/api/admin/seminars/${seminar.id}/registrations`)).rows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    }
  };
  const removed = (registration: string) => {
    setRows((old) => old?.filter((r) => r.registration !== registration) ?? null);
    void queries.invalidateQueries({ queryKey: ['seminars'] });
  };
  const replace = (row: Participant) => {
    setRows((old) => old?.map((r) => (r.contact === row.contact ? { ...r, ...row, registration: r.registration } : r)) ?? null);
    setEditing(null);
    void queries.invalidateQueries({ queryKey: ['seminars'] });
  };
  return (
    <section className="kort s8">
      <div className="kort-hovud">
        <h2>Namneliste</h2>
        {rows === null && (
          <button type="button" className="btn sm" onClick={() => void show()} disabled={seminar.registrations.total === 0}>
            Vis namnelista
          </button>
        )}
      </div>
      <div className="kort-innhald">
        <ErrorMessage error={error} />
        {rows === null ? (
          <p className="forklaring">Lista har namn og e-post. Kvar gong nokon opnar ho, blir det skrive i loggen.</p>
        ) : rows.length === 0 ? (
          <p className="tom">Ingen er påmelde no.</p>
        ) : (
          <div className="tabell-wrap">
            <table className="sem-pamelde">
              <thead>
                <tr>
                  <th scope="col">Namn</th>
                  <th scope="col">Bedrift</th>
                  <th scope="col">E-post</th>
                  <th scope="col">Påmeld</th>
                  <th scope="col">Invitasjon</th>
                  <th scope="col">
                    <span className="sr-only">Handlingar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) =>
                  editing === p.registration ? (
                    <tr key={p.registration}>
                      <td colSpan={6}>
                        <EditContact row={p} onDone={replace} onCancel={() => setEditing(null)} />
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.registration}>
                      <th scope="row">{p.name}</th>
                      <td>{p.company}</td>
                      <td>{p.email}</td>
                      <td>
                        {shortDate(p.registered_at)}
                        {p.lang === 'en' ? ' · English' : ''}
                      </td>
                      <td>{p.invite ? 'ja' : 'nei'}</td>
                      <td className="sem-rad-handling">
                        <div className="sem-rad-knappar">
                          <button type="button" className="btn sm ghost" aria-label={`Endre ${p.name}`} onClick={() => setEditing(p.registration)}>
                            Endre
                          </button>
                          <RemoveRegistration seminar={seminar.id} row={p} onDone={() => removed(p.registration)} />
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
