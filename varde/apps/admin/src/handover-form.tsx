import { useState } from 'react';
import { mutate } from './api.js';
import { ErrorMessage } from './queries.js';

export function HandoverForm({ client }: { client: string }) {
  const [reason, setReason] = useState(''),
    [recipient, setRecipient] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<{ handover_id: string; password: string } | null>(null);
  async function create() {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      setResult(
        await mutate(`/api/admin/clients/${client}/handover`, 'POST', { reason, recipient }),
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="handover" aria-labelledby="handover-tittel">
      <h2 id="handover-tittel">Lever data tilbake til kunden</h2>
      <p>
        Bruk dette ved skriftleg krav frå kunden. Fila inneheld svar frå alle rundar, leiarsvar og
        publiserte samla tal.
      </p>
      <label>
        Grunngjeving{' '}
        <textarea
          aria-label="Grunngjeving for utlevering"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label>
        Mottakar{' '}
        <input
          aria-label="Mottakar"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
      </label>
      <button
        disabled={busy || !reason.trim() || !recipient.trim()}
        onClick={() => {
          void create();
        }}
      >
        Lag kryptert fil
      </button>
      <ErrorMessage error={error} />
      {result && (
        <div role="status">
          <p>
            Passordet blir vist berre her: <code>{result.password}</code>. Ta vare på det og send
            det til mottakaren gjennom ein annan kanal.
          </p>
          <p>Fila kan lastast ned éin gong innan ti minutt. Ho kan opnast med 7-Zip.</p>
          <a
            href={`/api/admin/handover/${result.handover_id}.zip`}
            onClick={() => {
              setTimeout(() => setResult(null), 0);
            }}
          >
            Last ned kryptert ZIP
          </a>
        </div>
      )}
    </section>
  );
}
