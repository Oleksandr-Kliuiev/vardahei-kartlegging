// «Innstillingar» (2.16, decision 6 of 17.10): the contact, sender and opening hours that new surveys
// take. Surveys that exist keep their own; this only changes what the next new survey starts with.
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { ErrorMessage } from './queries.js';
import { useToast } from './shell.js';
import './bibliotek.css';

interface Words {
  nn: string;
  en?: string;
}
interface Defaults {
  contact: { name: string; phone: string; email: string; hours: Words };
  sender: Words;
  /** Saved by someone, or taken from the newest published survey of the clients. */
  saved: boolean;
}
const FIELDS = [
  ['name', 'Namn', 'Vardahei IT'],
  ['phone', 'Telefon', '+47 …'],
  ['email', 'E-post', 'post@…'],
] as const;

export function SettingsPage() {
  const queries = useQueryClient();
  const toast = useToast();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Defaults>('/api/admin/settings'),
  });
  const [value, setValue] = useState<Defaults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (settings.data && !value) setValue(settings.data);
  }, [settings.data]);
  if (!value)
    return (
      <section className="del">
        <ErrorMessage error={settings.error} />
        {!settings.error && <p role="status">Hentar innstillingane …</p>}
      </section>
    );
  const contact = (k: 'name' | 'phone' | 'email', v: string) =>
    setValue({ ...value, contact: { ...value.contact, [k]: v } });
  function save(e: FormEvent) {
    e.preventDefault();
    if (!value) return;
    setBusy(true);
    setError(null);
    mutate<Defaults>('/api/admin/settings', 'PUT', { contact: value.contact, sender: value.sender })
      .then((next) => {
        setValue(next);
        queries.setQueryData(['settings'], next);
        toast('Innstillingane er lagra. Nye skjema får dei frå no.');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error('Noko gjekk gale.')))
      .finally(() => setBusy(false));
  }
  return (
    <form className="del inn-skjema" onSubmit={save} aria-labelledby="inn-tittel">
      <h2 id="inn-tittel">Kontakt og avsendar i nye skjema</h2>
      <p className="inn-hint">
        {value.saved
          ? 'Nye skjema byrjar med dette. Skjema som finst, endrar seg ikkje.'
          : 'Henta frå det nyaste kundeskjemaet. Lagre for at nye skjema skal byrje med dette.'}
      </p>
      <fieldset className="inn-gruppe">
        <legend>Kontakt på slutten og ved feil</legend>
        <div className="inn-rad">
          {FIELDS.map(([k, label, hint]) => (
            <label key={k} className="inn-felt">
              {label}
              <input
                className="input"
                type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}
                required
                maxLength={k === 'phone' ? 40 : 120}
                placeholder={hint}
                value={value.contact[k]}
                onChange={(e) => contact(k, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="inn-rad">
          <Tekst
            label="Opningstid"
            value={value.contact.hours}
            onChange={(hours) => setValue({ ...value, contact: { ...value.contact, hours } })}
          />
        </div>
      </fieldset>
      <fieldset className="inn-gruppe">
        <legend>Avsendar under velkomstbrevet</legend>
        <div className="inn-rad">
          <Tekst
            label="Avsendar"
            value={value.sender}
            onChange={(sender) => setValue({ ...value, sender })}
          />
        </div>
      </fieldset>
      <ErrorMessage error={error} />
      <div className="knappar">
        <button type="submit" className="btn primary" disabled={busy}>
          Lagre innstillingane
        </button>
      </div>
    </form>
  );
}

/** A text in Nynorsk and English side by side. */
function Tekst({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Words;
  onChange: (v: Words) => void;
}) {
  return (
    <>
      <label className="inn-felt">
        {label} (nynorsk)
        <input
          className="input"
          required
          maxLength={200}
          value={value.nn}
          onChange={(e) => onChange({ ...value, nn: e.target.value })}
        />
      </label>
      <label className="inn-felt">
        {label} (engelsk)
        <input
          className="input"
          maxLength={200}
          value={value.en ?? ''}
          onChange={(e) => onChange({ ...value, en: e.target.value })}
        />
      </label>
    </>
  );
}
