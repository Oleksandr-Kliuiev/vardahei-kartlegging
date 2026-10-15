import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { ErrorMessage, useClients, useRounds } from './queries.js';
import { HoldButton } from './widgets.js';

type Counts = { common: number; leader: number; total: number; dry_run: boolean };

export function DeletionPage() {
  const clients = useClients(),
    rounds = useRounds(),
    queries = useQueryClient();
  const [scope, setScope] = useState('submissions'),
    [client, setClient] = useState(''),
    [key, setKey] = useState(''),
    [round, setRound] = useState('');
  const [ids, setIds] = useState(''),
    [reason, setReason] = useState(''),
    [preview, setPreview] = useState<Counts | null>(null);
  const [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const input = () => ({
    reason,
    scope:
      scope === 'submissions'
        ? { scope, submission_ids: ids.split(/[\s,]+/).filter(Boolean) }
        : scope === 'client'
          ? { scope, client }
          : {
              scope,
              client,
              respondent_key: key.trim().toUpperCase(),
              ...(round ? { round } : {}),
            },
  });
  const changed = () => {
    setPreview(null);
    setDone(false);
  };
  async function act(dry_run: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await mutate<Counts>('/api/admin/retention/forget', 'POST', {
        ...input(),
        dry_run,
      });
      if (dry_run) setPreview(result);
      else {
        setPreview(null);
        setDone(true);
        await queries.invalidateQueries({ queryKey: ['responses'] });
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="del">
      <p>Sletting tek bort svar og fritekst. Publiserte samla tal blir verande.</p>
      <fieldset disabled={busy} onChange={changed}>
        <label>
          Område{' '}
          <select aria-label="Område" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="submissions">Valde innsendingar</option>
            <option value="client">Alle svar frå kunden</option>
            <option value="respondent">Ein person (initialar)</option>
          </select>
        </label>
        {scope === 'submissions' ? (
          <label>
            Innsendings-ID-ar{' '}
            <textarea
              aria-label="Innsendings-ID-ar"
              value={ids}
              onChange={(e) => setIds(e.target.value)}
            />
          </label>
        ) : (
          <label>
            Kunde{' '}
            <select aria-label="Kunde" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">Vel kunde</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {scope === 'respondent' && (
          <>
            <label>
              Initialar{' '}
              <input aria-label="Initialar" value={key} onChange={(e) => setKey(e.target.value)} />
            </label>
            <label>
              Runde{' '}
              <select aria-label="Runde" value={round} onChange={(e) => setRound(e.target.value)}>
                <option value="">Alle identifiserte rundar</option>
                {rounds.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label>
          Grunngjeving{' '}
          <textarea
            aria-label="Grunngjeving"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          disabled={!reason.trim()}
          onClick={() => {
            void act(true);
          }}
        >
          Vis førehandsvising
        </button>
      </fieldset>
      {preview && (
        <div role="status">
          <p>
            {preview.common} vanlege svar og {preview.leader} leiarsvar. Til saman {preview.total}{' '}
            innsendingar.
          </p>
          <HoldButton
            className="fare"
            label="Stadfest sletting"
            hint="Hald inne knappen i over eitt sekund for å slette. Slettinga kan ikkje gjerast om."
            disabled={busy || !preview.total}
            onConfirm={() => {
              void act(false);
            }}
          />
        </div>
      )}
      {done && <p role="status">Svara er sletta.</p>}
      <ErrorMessage error={error} />
    </section>
  );
}
