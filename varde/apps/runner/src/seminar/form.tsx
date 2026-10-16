// Registration form of the seminar page (3.2): name, company (a client of the seminar or own
// text), e-mail and consent (short text, full text on request; its version goes with the form).
// The hidden «Nettstad» field is a honeypot: people never see or fill it.
import { useRef, useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { Icon } from '../icons.js';
import { register, SeminarError, type PublicSeminar } from './api.js';
import { st, type SemKey, type SemLang } from './texts.js';

type Field = 'name' | 'company' | 'email' | 'consent';
const OTHER = 'anna';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FAILURE: Record<number, SemKey> = {
  400: 'feilSjekk',
  409: 'feilEndra',
  410: 'feilStengd',
  429: 'feilForMange',
};

export function RegistrationForm({
  seminar,
  code,
  lang,
  onDone,
}: {
  seminar: PublicSeminar;
  code: string;
  lang: SemLang;
  onDone: () => void;
}) {
  const t = (k: SemKey) => st(lang, k);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(seminar.clients.length ? '' : OTHER);
  const [other, setOther] = useState('');
  const [consent, setConsent] = useState(false);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, SemKey>>>({});
  const [failure, setFailure] = useState<SemKey | null>(null);
  const [sending, setSending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const honey = useRef<HTMLInputElement>(null);
  const text = seminar.consent?.[lang] ?? seminar.consent?.nn;

  function check(): Partial<Record<Field, SemKey>> {
    const found: Partial<Record<Field, SemKey>> = {};
    if (!name.trim()) found.name = 'feilNamn';
    if (!company || (company === OTHER && !other.trim())) found.company = 'feilBedrift';
    if (!EMAIL.test(email.trim())) found.email = 'feilEpost';
    if (!consent) found.consent = 'feilSamtykke';
    return found;
  }
  const clear = (field: Field) => {
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
    setFailure(null);
  };
  async function submit(event: TargetedEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !seminar.consent) return;
    const found = check();
    setErrors(found);
    setFailure(null);
    const first = (['name', 'company', 'email', 'consent'] as const).find((f) => found[f]);
    if (first) {
      form.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    setSending(true);
    try {
      await register(code, {
        name: name.trim(),
        email: email.trim(),
        company: company === OTHER ? { name: other.trim() } : { client: company },
        consent: seminar.consent.version,
        lang,
        ...(honey.current?.value ? { website: honey.current.value } : {}),
      });
      onDone();
    } catch (error) {
      setFailure(error instanceof SeminarError ? (FAILURE[error.status] ?? 'feilNett') : 'feilNett');
      setSending(false);
    }
  }
  const described = (field: Field) =>
    errors[field] ? { 'aria-invalid': true, 'aria-describedby': `feil-${field}` } : {};
  const error = (field: Field) =>
    errors[field] ? (
      <p class="sem-feil" id={`feil-${field}`}>
        {t(errors[field])}
      </p>
    ) : null;

  return (
    <form class="sem-skjema anim" ref={form} noValidate onSubmit={(e) => void submit(e)}>
      <h2>{t('meldPa')}</h2>
      <div class="sem-felt">
        <label for="sem-namn">{t('namn')}</label>
        <input
          id="sem-namn"
          class="sem-input"
          data-field="name"
          name="name"
          autoComplete="name"
          maxLength={120}
          value={name}
          onInput={(e) => {
            setName(e.currentTarget.value);
            clear('name');
          }}
          {...described('name')}
        />
        {error('name')}
      </div>
      {seminar.clients.length > 0 ? (
        <fieldset class="sem-felt sem-val" {...described('company')}>
          <legend>{t('bedrift')}</legend>
          {[...seminar.clients, { id: OTHER, name: t('annaBedrift') }].map((c, i) => (
            <label class="sem-rad" key={c.id}>
              <input
                type="radio"
                name="company"
                value={c.id}
                checked={company === c.id}
                {...(i === 0 ? { 'data-field': 'company' } : {})}
                onChange={() => {
                  setCompany(c.id);
                  clear('company');
                }}
              />
              <span>{c.name}</span>
            </label>
          ))}
          {company === OTHER && (
            <div class="sem-felt sem-anna">
              <label for="sem-anna">{t('namnBedrift')}</label>
              <input
                id="sem-anna"
                class="sem-input"
                name="organization"
                autoComplete="organization"
                maxLength={120}
                value={other}
                onInput={(e) => {
                  setOther(e.currentTarget.value);
                  clear('company');
                }}
              />
            </div>
          )}
          {error('company')}
        </fieldset>
      ) : (
        <div class="sem-felt">
          <label for="sem-bedrift">{t('bedrift')}</label>
          <input
            id="sem-bedrift"
            class="sem-input"
            data-field="company"
            name="organization"
            autoComplete="organization"
            maxLength={120}
            value={other}
            onInput={(e) => {
              setOther(e.currentTarget.value);
              clear('company');
            }}
            {...described('company')}
          />
          {error('company')}
        </div>
      )}
      <div class="sem-felt">
        <label for="sem-epost">{t('epost')}</label>
        <input
          id="sem-epost"
          class="sem-input"
          data-field="email"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          value={email}
          onInput={(e) => {
            setEmail(e.currentTarget.value);
            clear('email');
          }}
          {...described('email')}
        />
        {error('email')}
      </div>
      <div class="sem-hp" aria-hidden="true">
        <label>
          Nettstad <input ref={honey} name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {text && (
        <div class="sem-samtykke">
          <label class="sem-kryss">
            <input
              type="checkbox"
              data-field="consent"
              checked={consent}
              onChange={(e) => {
                setConsent(e.currentTarget.checked);
                clear('consent');
              }}
              {...described('consent')}
            />
            <span>{text.short}</span>
          </label>
          <button
            type="button"
            class="linkbtn"
            aria-expanded={open}
            aria-controls="samtykke-meir"
            onClick={() => setOpen(!open)}
          >
            {t(open ? 'visMindre' : 'lesMeir')}
            <Icon name="ned" small />
          </button>
          <div class="sem-meir" id="samtykke-meir" data-open={open ? 'true' : 'false'}>
            <div>
              <ul>
                {text.full.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
          {error('consent')}
        </div>
      )}
      {failure && (
        <div role="alert" class="feilmelding">
          <Icon name="varsel" />
          <span>{t(failure)}</span>
        </div>
      )}
      <button type="submit" class="btn primary sem-send" disabled={sending} aria-busy={sending}>
        {sending ? <span class="spinn" aria-hidden="true" /> : null}
        {t(sending ? 'sender' : 'meldMegPa')}
      </button>
    </form>
  );
}
