import { useState } from 'react';
import { schemaMessage } from './schema-message.js';

export type Json = null | string | number | boolean | Json[] | { [key: string]: Json | undefined };
export interface Issue {
  path: (string | number)[];
  message: string;
}
export function FieldIssues({ issues, path }: { issues: Issue[]; path: (string | number)[] }) {
  return (
    <>
      {issues
        .filter((i) => i.path.join('.') === path.join('.'))
        .map((i, n) => (
          <small role="alert" key={n}>
            {schemaMessage(i.message)}
          </small>
        ))}
    </>
  );
}
export function LocalText({
  label,
  value,
  languages,
  onChange,
}: {
  label: string;
  value: Record<string, string | undefined>;
  languages: string[];
  onChange: (v: Record<string, string>) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {languages.map((l) => (
        <label key={l}>
          {l}
          <textarea
            aria-label={`${label} (${l})`}
            value={value[l] ?? ''}
            onChange={(e) => onChange({ ...value, [l]: e.target.value } as Record<string, string>)}
          />
        </label>
      ))}
    </fieldset>
  );
}
export function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: Json) => void | Promise<void>;
}) {
  const [raw, setRaw] = useState<string | null>(null),
    [error, setError] = useState('');
  return (
    <div className="json-field">
      <label>
        {label}
        <textarea
          spellCheck={false}
          value={raw ?? JSON.stringify(value, null, 2)}
          onChange={(e) => {
            setRaw(e.target.value);
            setError('');
          }}
        />
      </label>
      {raw !== null && (
        <>
          <small>JSON-endringane blir brukte når du trykkjer «Bruk JSON».</small>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  const parsed = JSON.parse(raw) as Json;
                  await onChange(parsed);
                  setRaw(null);
                  setError('');
                } catch (e) {
                  setError(
                    e instanceof SyntaxError
                      ? 'Skriv gyldig JSON.'
                      : e instanceof Error
                        ? e.message
                        : 'Kontroller JSON-felta.',
                  );
                }
              })();
            }}
          >
            Bruk JSON
          </button>
        </>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

const labels: Record<string, string> = {
  intro: 'Innleiing',
  title: 'Tittel',
  short: 'Kort innleiing',
  minutes: 'Minutt',
  letter: 'Brev',
  sender: 'Avsendar',
  facts: 'Fakta',
  contact: 'Kontakt',
  name: 'Namn',
  phone: 'Telefon',
  email: 'E-post',
  hours: 'Opningstid',
  leader_intro: 'Innleiing for leiar',
  leader_roles: 'Rolle-ID for leiarar',
  text: 'Tekst',
  texts: 'Tekstar',
  invitation: 'Invitasjon',
  poster: 'Plakat',
  footer: 'Botntekst',
  tips: 'Råd',
  max_tips: 'Maks råd',
  scale: 'Skala',
  min: 'Minimum',
  max: 'Maksimum',
  low: 'Lågaste verdi',
  high: 'Høgaste verdi',
  rows: 'Rader',
  free_text: 'Fritekst',
  when: 'Svar-ID for vilkår',
  score_scale: 'Risikoskalа',
  levels: 'Nivå',
};
/** Metadata forms retain the exact schema structure, including arrays and localized texts. */
export function ObjectFields({
  value,
  path = [],
  issues,
  languages = ['nn'],
  onChange,
}: {
  value: Json;
  languages?: string[];
  path?: (string | number)[];
  issues: Issue[];
  onChange: (v: Json) => void;
}) {
  const key = String(path.at(-1) ?? 'Innhald');
  const label = labels[key] ?? key;
  const error = <FieldIssues issues={issues} path={path} />;
  if (typeof value === 'string' || typeof value === 'number')
    return (
      <label>
        {label}
        <input
          type={typeof value === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) =>
            onChange(typeof value === 'number' ? Number(e.target.value) : e.target.value)
          }
        />
        {error}
      </label>
    );
  if (typeof value === 'boolean')
    return (
      <label>
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        {label}
        {error}
      </label>
    );
  if (value === null) return <JsonField label={label} value={value} onChange={onChange} />;
  if (!Array.isArray(value) && 'nn' in value)
    return (
      <fieldset>
        <legend>{label}</legend>
        {error}
        {languages.map((lang) => (
          <ObjectFields
            key={lang}
            value={value[lang] ?? ''}
            path={[...path, lang]}
            languages={languages}
            issues={issues}
            onChange={(next) => onChange({ ...value, [lang]: next })}
          />
        ))}
      </fieldset>
    );
  if (Array.isArray(value))
    return (
      <fieldset>
        <legend>{label}</legend>
        {error}
        {value.map((v, n) => (
          <div key={n}>
            <ObjectFields
              value={v}
              path={[...path, n]}
              issues={issues}
              languages={languages}
              onChange={(next) => onChange(value.map((x, i) => (i === n ? next : x)))}
            />
            <button type="button" onClick={() => onChange(value.filter((_, i) => i !== n))}>
              Fjern linje
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange([
              ...value,
              key === 'rows'
                ? { id: `rad${value.length + 1}`, texts: { text: { nn: '' } } }
                : typeof value[0] === 'string' || key === 'leader_roles' || key === 'when'
                  ? ''
                  : { nn: '' },
            ])
          }
        >
          Legg til linje
        </button>
      </fieldset>
    );
  return (
    <fieldset>
      <legend>{label}</legend>
      {error}
      {Object.entries(value).map(([key, v]) =>
        v === undefined ? null : (
          <ObjectFields
            key={key}
            value={v}
            path={[...path, key]}
            issues={issues}
            languages={languages}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        ),
      )}
    </fieldset>
  );
}
