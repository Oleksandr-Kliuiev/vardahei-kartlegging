// Adding and removing a client's contact person from the client's own page (wave A). Before this a
// contact could only be born on a seminar form, and could only be removed in «Personvern ›
// Sletting» by typing the e-mail from memory. Both now sit where the person is read — the deletion
// through the same audited path as before, with a reason and a receipt.
import { useState, type FormEvent } from 'react';
import { mutate } from './api.js';
import type { Client } from './models.js';
import { ErrorMessage } from './queries.js';
import { useToast } from './shell.js';

/** Vardahei enters the client's contact person; the consent to invitations is never ours to give. */
export function NyKontakt({
  client,
  onSaved,
  onClose,
}: {
  client: Client;
  onSaved: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await mutate('/api/admin/contacts', 'POST', {
        name: data.get('name'),
        email: data.get('email'),
        role: data.get('role'),
        client: client.id,
      });
      toast('Kontakten er lagd til.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Kontakten blei ikkje lagd til.'));
      setBusy(false);
    }
  }
  return (
    <form className="sem-form" aria-label="Ny kontakt" onSubmit={(e) => void save(e)}>
      <fieldset disabled={busy}>
        <label className="field">
          <span>Namn</span>
          <input className="input" name="name" required maxLength={120} />
        </label>
        <label className="field">
          <span>E-post</span>
          <input className="input" name="email" type="email" required maxLength={254} />
        </label>
        <label className="field">
          <span>Rolle hos kunden</span>
          <input
            className="input"
            name="role"
            maxLength={120}
            placeholder="dagleg leiar, IT-ansvarleg …"
          />
        </label>
        <p className="forklaring">
          Kontakten blir lagra fordi de samarbeider med {client.name}, ikkje på eit samtykke. Han
          får ikkje invitasjonar til seminar: det kan berre personen sjølv seie ja til, på
          påmeldingssida. Ein gong i året sjekkar de at samarbeidet framleis gjeld.
        </p>
        <ErrorMessage error={error} />
        <div className="handlingar">
          <button type="submit" className="btn primary sm">
            Lagre kontakten
          </button>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Avbryt
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/** «Slett kontakten»: the same deletion on request as «Personvern › Sletting», with its reason. */
export function SlettKontakt({
  name,
  email,
  onDone,
}: {
  name: string;
  email: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await mutate('/api/admin/retention/forget', 'POST', {
        reason,
        dry_run: false,
        scope: { scope: 'participant', email },
      });
      toast(`${name} er sletta.`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Kontakten blei ikkje sletta.'));
      setBusy(false);
    }
  }
  if (!asking)
    return (
      <button
        type="button"
        className="btn sm ghost"
        aria-label={`Slett kontakten ${name}`}
        onClick={() => setAsking(true)}
      >
        Slett
      </button>
    );
  return (
    <div className="sem-sporsmal bolk" role="group" aria-label={`Stadfest sletting av ${name}`}>
      <p>
        {name} og påmeldingane til personen blir sletta. Det kan ikkje gjerast om. Publiserte samla
        tal blir verande.
      </p>
      <label className="field">
        <span>Grunngjeving</span>
        <input
          className="input"
          maxLength={1000}
          required
          placeholder="Til dømes: personen har slutta hos kunden"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <p className="forklaring">Skriv ikkje namn eller e-post her; det står i loggen frå før.</p>
      <ErrorMessage error={error} />
      <div className="handlingar">
        <button
          type="button"
          className="btn sm fare"
          disabled={busy || reason.trim() === ''}
          onClick={() => void remove()}
        >
          Slett kontakten
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
