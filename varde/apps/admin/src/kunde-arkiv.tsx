// «Arkiver kunden» (wave B). A client with rounds, seminars or conversations can never be deleted:
// the answers and the history would go with it. Archiving is what a duplicate or a client Vardahei
// no longer works with gets instead — it keeps everything it has, and stays out of the lists and
// the pickers until someone takes it back.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import type { Client } from './models.js';
import { ErrorMessage } from './queries.js';
import { useToast } from './shell.js';

export function ArkiverKunde({ client }: { client: Client }) {
  const queries = useQueryClient();
  const toast = useToast();
  const archived = client.archived_at !== null;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function set(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/admin/clients/${client.id}/archive`, 'PUT', { archived: next });
      await queries.invalidateQueries({ queryKey: ['rounds'] });
      toast(next ? `${client.name} er arkivert.` : `${client.name} er henta attende.`);
      setAsking(false);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Det gjekk ikkje.'));
    } finally {
      setBusy(false);
    }
  }
  if (archived)
    return (
      <>
        <button type="button" className="btn" disabled={busy} onClick={() => void set(false)}>
          <Icon name="pil" small />
          Hent kunden attende
        </button>
        <ErrorMessage error={error} />
      </>
    );
  if (!asking)
    return (
      <button type="button" className="btn" onClick={() => setAsking(true)}>
        Arkiver kunden
      </button>
    );
  return (
    <div className="sem-sporsmal" role="group" aria-label={`Stadfest arkivering av ${client.name}`}>
      <p>
        {client.name} blir verande med alt han har, men kjem ikkje opp i kundelista eller når du vel
        kundar til ei runde, eit seminar eller ei samtalerunde. Du kan hente han attende når som
        helst.
      </p>
      <ErrorMessage error={error} />
      <div className="handlingar">
        <button type="button" className="btn sm" disabled={busy} onClick={() => void set(true)}>
          Arkiver kunden
        </button>
        <button
          type="button"
          className="btn sm ghost"
          disabled={busy}
          onClick={() => {
            setAsking(false);
            setError(null);
          }}
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}
