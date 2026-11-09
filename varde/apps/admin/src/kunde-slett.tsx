// «Slett kunden»: for a duplicate or a mistake. The button first asks the server what the client is
// tied to: with nothing, the question with the consequence; with anything, the reason why not.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { Icon } from './icons.js';
import type { Client } from './models.js';
import { goTo } from './nav.js';
import { useToast } from './shell.js';
import './seminar.css';

export interface ClientTies {
  rounds: number;
  seminars: number;
  interviews: number;
  contacts: number;
  history: number;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The ties in words: «2 rundar, 1 seminar og 3 kontaktar». */
export function tiesText(t: ClientTies) {
  const parts = [
    t.rounds && count(t.rounds, 'runde', 'rundar'),
    t.seminars && count(t.seminars, 'seminar', 'seminar'),
    t.interviews && count(t.interviews, 'samtale', 'samtalar'),
    t.contacts && count(t.contacts, 'kontakt', 'kontaktar'),
    t.history && 'tidlegare resultat',
  ].filter((p): p is string => !!p);
  return parts.length < 2
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} og ${parts[parts.length - 1]}`;
}

export function SlettKunde({ client }: { client: Pick<Client, 'id' | 'name'> }) {
  const queries = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [ties, setTies] = useState<ClientTies | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const path = `/api/admin/clients/${client.id}`;

  async function ask() {
    setOpen(true);
    setBusy(true);
    setError('');
    setTies(null);
    try {
      setTies(await api<ClientTies>(`${path}/ties`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikkje sjekke kunden.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await mutate(path, 'DELETE');
      toast(`«${client.name}» er sletta.`);
      goTo('/admin/clients');
      void queries.invalidateQueries({ queryKey: ['rounds'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikkje slette kunden.');
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" className="btn ghost fare" onClick={() => void ask()}>
        <Icon name="slett" small />
        Slett kunden
      </button>
    );
  const text = ties && tiesText(ties);
  return (
    <div className="sem-sporsmal" role="group" aria-label={`Slett ${client.name}`}>
      {!ties && !error && <p role="status">Sjekkar kva kunden er knytt til …</p>}
      {ties && !text && <p>«{client.name}» blir sletta. Det kan ikkje angrast.</p>}
      {text && (
        <p>
          «{client.name}» kan ikkje slettast, fordi kunden er knytt til {text}. Slik går ikkje svar
          og historikk tapt.
        </p>
      )}
      {error && (
        <p role="alert" className="sem-sporsmal-feil">
          {error}
        </p>
      )}
      <div className="handlingar">
        {ties && !text && (
          <button
            type="button"
            className="btn sm fare"
            disabled={busy}
            onClick={() => void remove()}
          >
            <Icon name="slett" small />
            Slett kunden
          </button>
        )}
        <button
          type="button"
          className="btn sm ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          {ties && !text ? 'Avbryt' : 'Lukk'}
        </button>
      </div>
    </div>
  );
}
