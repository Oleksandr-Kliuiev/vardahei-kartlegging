import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { ErrorMessage, useClients, useRounds } from './queries.js';
import { HoldButton } from './widgets.js';

type Counts = { total: number; dry_run: boolean } & (
  { common: number; leader: number } | { contacts: number; registrations: number }
);

/** What a participant deletion removes (3.1). */
export function participantText(contacts: number, registrations: number) {
  if (!contacts) return 'Fann ingen deltakar med den e-postadressa.';
  return `Kontakten og ${registrations} ${registrations === 1 ? 'påmelding' : 'påmeldingar'} blir sletta.`;
}

export function DeletionPage() {
  const clients = useClients(),
    rounds = useRounds(),
    queries = useQueryClient();
  const [scope, setScope] = useState('respondent'),
    [client, setClient] = useState(''),
    [key, setKey] = useState(''),
    [round, setRound] = useState('');
  const [ids, setIds] = useState(''),
    [mail, setMail] = useState(''),
    [reason, setReason] = useState(''),
    [preview, setPreview] = useState<Counts | null>(null),
    [target, setTarget] = useState('');
  const [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [receipt, setReceipt] = useState('');
  const input = () => ({
    reason,
    scope:
      scope === 'submissions'
        ? { scope, submission_ids: ids.split(/[\s,]+/).filter(Boolean) }
        : scope === 'participant'
          ? { scope, email: mail.trim() }
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
  /** The selection in words, so the preview says exactly what would be deleted. */
  const describe = () => {
    const clientName = clients.data?.find((c) => c.id === client)?.name ?? 'kunden';
    const roundName = rounds.data?.find((r) => r.id === round)?.name;
    if (scope === 'participant') return `Deltakaren ${mail.trim()} på seminar`;
    if (scope === 'submissions') {
      const n = ids.split(/[\s,]+/).filter(Boolean).length;
      return `${n} ${n === 1 ? 'valt innsending' : 'valde innsendingar'}`;
    }
    if (scope === 'client') return `Alle svar frå ${clientName}`;
    return `Initialar ${key.trim().toUpperCase()} hos ${clientName}, ${roundName ? `runden ${roundName}` : 'alle identifiserte rundar'}`;
  };
  async function act(dry_run: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await mutate<Counts>('/api/admin/retention/forget', 'POST', {
        ...input(),
        dry_run,
      });
      if (dry_run) {
        setPreview(result);
        setTarget(describe());
      } else {
        const when = new Date();
        const p = (n: number) => String(n).padStart(2, '0');
        setReceipt(
          `${target}. ${
            'contacts' in result
              ? participantText(result.contacts, result.registrations)
              : `${result.total} innsendingar fjerna`
          }. ${p(when.getDate())}.${p(when.getMonth() + 1)}.${when.getFullYear()} ${p(when.getHours())}:${p(when.getMinutes())}.`,
        );
        setPreview(null);
        setDone(true);
        await queries.invalidateQueries({
          queryKey: [scope === 'participant' ? 'seminars' : 'responses'],
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="del smal">
      <p>Sletting tek bort svar og fritekst. Publiserte samla tal blir verande.</p>
      <fieldset disabled={busy} onChange={changed}>
        <label>
          Område{' '}
          <select aria-label="Område" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="respondent">Ein person (initialar)</option>
            <option value="client">Alle svar frå kunden</option>
            <option value="submissions">Valde innsendingar (ID-ar)</option>
            <option value="participant">Deltakar på seminar (e-post)</option>
          </select>
        </label>
        {scope === 'participant' ? (
          <>
            <label>
              E-post{' '}
              <input
                aria-label="E-post"
                type="email"
                autoComplete="off"
                value={mail}
                onChange={(e) => setMail(e.target.value)}
              />
            </label>
            <p className="forklaring">
              Kontakten og alle påmeldingane til personen blir sletta. Skriv ikkje namn eller e-post
              i grunngjevinga.
            </p>
          </>
        ) : scope === 'submissions' ? (
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
          Førehandsvis
        </button>
        {!reason.trim() && (
          <p className="forklaring">Skriv ei grunngjeving for å sjå førehandsvisinga.</p>
        )}
      </fieldset>
      {preview && (
        <div role="status">
          <p>
            <strong>Du slettar:</strong> {target}
          </p>
          <p>
            {'contacts' in preview
              ? participantText(preview.contacts, preview.registrations)
              : `${preview.common} vanlege svar og ${preview.leader} leiarsvar. Til saman ${preview.total} innsendingar.`}
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
      {done && (
        <p role="status">
          {scope === 'participant' ? 'Deltakaren er sletta.' : 'Svara er sletta.'}{' '}
          <span className="forklaring">{receipt}</span>
        </p>
      )}
      <ErrorMessage error={error} />
    </section>
  );
}
