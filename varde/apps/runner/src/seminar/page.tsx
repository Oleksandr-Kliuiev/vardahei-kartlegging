// The seminar page `/s?c=<code>` (3.2, 3.3, Vardestien): before the seminar the topic, time,
// place and the registration form; after registering «Du er påmeld» with a calendar file; after
// the seminar its material. Languages are those of the seminar, nynorsk first. The first view is
// shown at rest; «Du er påmeld» rises in (useEnter).
import { useEffect, useRef, useState } from 'preact/hooks';
import { ContactCard, VARDAHEI_CONTACT } from '../contact.js';
import { CairnMark, Icon } from '../icons.js';
import logo from '../logo.png';
import { useEnter } from '../motion-hooks.js';
import { loadSeminar, saveCalendar, SeminarError, type PublicSeminar } from './api.js';
import { RegistrationForm } from './form.js';
import { list, st, type SemKey, type SemLang } from './texts.js';

const NAMES: Record<SemLang, string> = { nn: 'Nynorsk', en: 'English' };
type View =
  | { kind: 'loading' }
  | { kind: 'error'; status: number }
  | { kind: 'ready'; seminar: PublicSeminar };
type Props = { seminar: PublicSeminar; lang: SemLang };

const pick = (value: Partial<Record<SemLang, string>>, lang: SemLang) => value[lang] ?? value.nn ?? '';
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

/** Layers of hills under the top line, in the colours of the landscape tokens. */
function Hills() {
  return (
    <svg class="sem-fjell" viewBox="0 0 400 48" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path class="bak" d="M0,48 L0,30 L40,22 L80,28 L130,12 L175,24 L220,9 L265,22 L310,14 L355,24 L400,16 L400,48Z" />
      <path class="midt" d="M0,48 L0,36 L50,30 L95,38 L150,26 L200,34 L245,24 L300,34 L350,28 L400,32 L400,48Z" />
      <path class="fram" d="M0,48 L0,42 L60,38 L120,44 L180,36 L240,42 L300,38 L360,44 L400,40 L400,48Z" />
    </svg>
  );
}

function Facts({ seminar, lang }: Props) {
  const t = (k: SemKey) => st(lang, k);
  return (
    <ul class="fakta anim">
      <li>
        <Icon name="kalender" />
        <span>
          <span class="sr-only">{t('nar')}: </span>
          {pick(seminar.when, lang)}
        </span>
      </li>
      <li>
        <Icon name="stad" />
        <span>
          <span class="sr-only">{t('kvar')}: </span>
          {seminar.format === 'digital' ? `${t('digitalt')} · ${seminar.place}` : seminar.place}
        </span>
      </li>
      {seminar.clients.length > 0 && (
        <li>
          <Icon name="folk" />
          <span>
            {t('forKundar')} {list(seminar.clients.map((c) => c.name), lang)}
          </span>
        </li>
      )}
    </ul>
  );
}

function Registered({ seminar, lang, code }: Props & { code: string }) {
  const t = (k: SemKey) => st(lang, k);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div class="skjerm sem-takk" data-step="done">
      <div class="sem-ok anim">
        <Icon name="hake" />
      </div>
      <h1 class="anim" tabIndex={-1}>
        {t('pameldTittel')}
      </h1>
      <p class="ingress anim">{t('pameldTekst')}</p>
      <p class="sem-tema anim">{pick(seminar.topic, lang)}</p>
      <Facts seminar={seminar} lang={lang} />
      <div class="handlingar anim">
        <button
          type="button"
          id="kalender"
          class="btn primary"
          aria-busy={busy}
          onClick={() => {
            if (busy) return;
            setBusy(true);
            setFailed(false);
            saveCalendar(code, lang)
              .catch(() => setFailed(true))
              .finally(() => setBusy(false));
          }}
        >
          <Icon name="kalender" small />
          {t('kalender')}
        </button>
      </div>
      {failed && (
        <p role="alert" class="sem-feil">
          {t('kalenderFeil')}
        </p>
      )}
      <p class="muted sem-merk anim">{t('taVare')}</p>
    </div>
  );
}

function Held({ seminar, lang }: Props) {
  const t = (k: SemKey) => st(lang, k);
  const materials = seminar.materials ?? [];
  return (
    <div class="skjerm sem-over" data-step="held">
      <div class="eyebrow anim sem-eyebrow">
        <CairnMark />
        {t('overEyebrow')}
      </div>
      <h1 class="anim" tabIndex={-1}>
        {pick(seminar.topic, lang)}
      </h1>
      <Facts seminar={seminar} lang={lang} />
      <section class="sem-materiell anim" aria-labelledby="materiell-tittel">
        <h2 id="materiell-tittel">{t('materiell')}</h2>
        {materials.length > 0 ? (
          <ul>
            {materials.map((m) => (
              <li key={m.url}>
                <a href={m.url} target="_blank" rel="noopener noreferrer">
                  <Icon name="dok" />
                  <span>
                    <b>{m.title}</b>
                    <small>{hostOf(m.url)}</small>
                  </span>
                  <span class="sr-only"> ({t('opnarNy')})</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted">{t('ingenMateriell')}</p>
        )}
      </section>
      <p class="muted sem-merk anim">{t('stengd')}</p>
    </div>
  );
}

function Problem({ status, lang }: { status: number; lang: SemLang }) {
  const t = (k: SemKey) => st(lang, k);
  const offline = status === 0 || status >= 500;
  return (
    <div class="skjerm tilstand" data-state={offline ? 'offline' : 'invalid'}>
      <div class="ikon anim">
        <Icon name={offline ? 'varsel' : 'lenke'} />
      </div>
      <h1 class="anim" tabIndex={-1}>
        {t(offline ? 'nettTittel' : 'ugyldigTittel')}
      </h1>
      <p class="anim">{t(offline ? 'nettTekst' : 'ugyldigTekst')}</p>
      <ContactCard contact={VARDAHEI_CONTACT} lang={lang} />
    </div>
  );
}

export function SeminarPage() {
  const code = new URLSearchParams(location.search).get('c') ?? '';
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [lang, setLang] = useState<SemLang>('nn');
  const [done, setDone] = useState(false);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadSeminar(code, controller.signal).then(
      (seminar) => setView({ kind: 'ready', seminar }),
      (error: unknown) => {
        if (!controller.signal.aborted)
          setView({ kind: 'error', status: error instanceof SeminarError ? error.status : 0 });
      },
    );
    return () => controller.abort();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const seminar = view.kind === 'ready' ? view.seminar : null;
  // As in the survey, the first content after loading is shown at rest; only «Du er påmeld»
  // rises in, as the next step of the same page.
  useEnter(main, done ? 'done' : 'first', 1);
  useEffect(() => {
    if (done) main.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [done]);
  return (
    <>
      <header class="topbar">
        <span class="logo-plate">
          <img class="logo" src={logo} alt="Vardahei IT" width={120} height={24} />
        </span>
        {seminar && seminar.languages.length > 1 && (
          <div class="seg sprak" role="group" aria-label={st(lang, 'sprak')}>
            {seminar.languages.map((l) => (
              <button type="button" id={`sprak-${l}`} aria-pressed={lang === l} onClick={() => setLang(l)}>
                {NAMES[l]}
              </button>
            ))}
          </div>
        )}
      </header>
      <Hills />
      <main id="main" class="app sem" ref={main}>
        {view.kind === 'loading' && (
          <div class="skjerm tilstand" aria-busy="true">
            <div class="skel l1" />
            <div class="skel l2" />
            <div class="skel l3" />
            <p class="sr-only" role="status">
              {st(lang, 'hentar')}
            </p>
          </div>
        )}
        {view.kind === 'error' && <Problem status={view.status} lang={lang} />}
        {seminar && done && <Registered seminar={seminar} lang={lang} code={code} />}
        {seminar && !done && seminar.phase === 'open' && (
          <div class="skjerm sem-open" data-step="open">
            <div class="eyebrow anim sem-eyebrow">
              <CairnMark />
              {st(lang, 'eyebrow')}
            </div>
            <h1 class="anim" tabIndex={-1}>
              {pick(seminar.topic, lang)}
            </h1>
            <Facts seminar={seminar} lang={lang} />
            <RegistrationForm seminar={seminar} code={code} lang={lang} onDone={() => setDone(true)} />
          </div>
        )}
        {seminar && !done && seminar.phase === 'held' && <Held seminar={seminar} lang={lang} />}
      </main>
    </>
  );
}
