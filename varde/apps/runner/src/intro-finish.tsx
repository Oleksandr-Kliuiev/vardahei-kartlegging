import { useState } from 'preact/hooks';
import { evaluate, prune, type Answers } from '@varde/rules/runner';
import type { TemplateContent } from '@varde/schema/template/template';
import type { Lang } from '@varde/schema/template/texts';
import { ease, stagger } from '@varde/ui/motion';
import nn from './i18n/notice-v2.nn.json';
import { notice } from './i18n/notice.js';
import { text, ui } from './i18n/ui.js';
import { Icon } from './icons.js';
import { ContactCard } from './contact.js';

type NoticeKey = keyof typeof nn;
/** The short answer to «who sees my answers» stays visible; the rest of the approved notice opens on request. */
const SUMMARY: Record<'identified' | 'anonymous', NoticeKey[]> = {
  identified: [
    'notice.identified.intro',
    'notice.identified.who_sees',
    'notice.identified.client_gets',
  ],
  anonymous: ['notice.anonymous.intro'],
};

export function Intro({
  version,
  client,
  lang,
}: {
  version: TemplateContent;
  client: string;
  lang: Lang;
  start?: () => void;
}) {
  const mode = version.identification === 'initials' ? 'identified' : 'anonymous';
  const all = (Object.keys(nn) as NoticeKey[]).filter(
    (k) => k.startsWith(`notice.${mode}.`) || k.startsWith('notice.common.'),
  );
  const rest = all.filter((k) => !SUMMARY[mode].includes(k));
  const [open, setOpen] = useState(false);
  return (
    <div class="skjerm intro brev" data-step="intro">
      <div class="eyebrow anim">{text(version.intro.short, lang)}</div>
      <h1 class="anim" tabIndex={-1}>
        {text(version.intro.title, lang)}
      </h1>
      {version.intro.letter.map((p) => (
        <p class="anim">{text(p, lang)}</p>
      ))}
      <p class="anim">
        {ui(lang, 'for')} <span class="kunde">{client}</span>.
      </p>
      <ul class="fakta">
        <li class="anim">
          <Icon name="klokke" />
          <span>{ui(lang, 'f1', version.intro.minutes)}</span>
        </li>
        {version.intro.facts.slice(1).map((fact) => (
          <li class="anim">
            <Icon name="hake" />
            <span>{text(fact, lang)}</span>
          </li>
        ))}
      </ul>
      <section class="personvern anim" aria-labelledby="kven-ser">
        <div class="personvern-topp">
          <span class="merke">
            <Icon name="skjold" />
          </span>
          <div class="notis">
            <h2 id="kven-ser">{ui(lang, 'kvenSer')}</h2>
            {SUMMARY[mode].map((key) => (
              <p data-notice={key}>{notice(lang, key)}</p>
            ))}
          </div>
        </div>
        <button
          type="button"
          class="linkbtn"
          aria-expanded={open}
          aria-controls="personvern-meir"
          onClick={() => {
            setOpen(!open);
            if (!open)
              requestAnimationFrame(
                () =>
                  void stagger(
                    document.querySelectorAll('#personvern-meir li'),
                    [
                      { opacity: 0, transform: 'translateY(6px)' },
                      { opacity: 1, transform: 'none' },
                    ],
                    {
                      duration: 360,
                      step: 40,
                      easing: ease.inn,
                      fill: 'backwards',
                    },
                  ),
              );
          }}
        >
          {ui(lang, open ? 'lesMindre' : 'lesMeir')} <Icon name="ned" small />
        </button>
        <div class="meir" id="personvern-meir" data-open={open ? 'true' : 'false'}>
          <div>
            <ul>
              {rest.map((key) => (
                <li data-notice={key}>{notice(lang, key)}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <p class="helsing anim">
        {ui(lang, 'helsing')} {text(version.intro.sender, lang)}
      </p>
    </div>
  );
}

/** Same selection as kartlegging/public/index.html (~889-898): every tip is filtered by its
 * condition; "reserve" is an ordinary tip when it matches and the single fallback when no
 * regular tip matches; a closing tip is shown only when its own condition holds. */
export function selectedTips(version: TemplateContent, answers: Answers) {
  const clean = prune(version, answers);
  const hits = version.tips.filter((t) => evaluate(t.when, clean));
  const regular = hits.filter((t) => !t.closing).slice(0, version.max_tips);
  return [
    ...(regular.length ? regular : version.tips.filter((t) => t.reserve).slice(0, 1)),
    ...hits.filter((t) => t.closing),
  ];
}

export function Finish({
  version,
  answers,
  lang,
  client,
}: {
  version: TemplateContent;
  answers: Answers;
  lang: Lang;
  client?: string;
}) {
  const scenarios = version.questions.filter((q) => 'scenario' in q && q.scenario !== undefined);
  const tips = selectedTips(version, answers),
    contact = version.intro.contact;
  return (
    <div class="skjerm slutt">
      <div class="eyebrow anim">{ui(lang, 'toppen')}</div>
      <h1 class="anim" tabIndex={-1}>
        {ui(lang, 'takk')}
      </h1>
      <p class="ingress anim">{ui(lang, 'sendt')}</p>
      {scenarios.length > 0 && (
        <section data-section="scenarios" class="anim">
          <h2>{ui(lang, scenarios.length === 1 ? 'situasjonen' : 'situasjonane')}</h2>
          {scenarios.map((q) => {
            if (!('scenario' in q) || !q.scenario) return null;
            const value = answers[q.id];
            const picked = q.options
              .filter((o) => (Array.isArray(value) ? value.includes(o.id) : value === o.id))
              .map((o) => text(o.texts.text, lang));
            const correct = q.scenario.correct_options.some((o) =>
              Array.isArray(value) ? value.includes(o) : value === o,
            );
            return (
              <div class="fasit" data-scenario={q.id}>
                <h3>{text(q.scenario.explanation.title, lang)}</h3>
                <p class="ditt">
                  {picked.length ? (
                    <>
                      {ui(lang, 'duValde')}: <b>{picked.join(', ')}</b>
                    </>
                  ) : (
                    ui(lang, 'hoppa')
                  )}
                </p>
                {correct && <p class="merk">✓ {ui(lang, 'rett')}</p>}
                <p>{text(q.scenario.explanation.text, lang)}</p>
              </div>
            );
          })}
        </section>
      )}
      {version.tips.length > 0 && (
        <section data-section="tips" class="anim">
          <h2>{ui(lang, 'rad')}</h2>
          <div class="tips">
            {tips.map((tip) => (
              <article data-tip={tip.id}>
                <h3>{text(tip.title, lang)}</h3>
                <p>{text(tip.text, lang)}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      <h2 class="kva-skjer anim">{ui(lang, 'kvaSkjer')}</h2>
      <ol class="steg">
        <li class="gjort anim">
          <span class="nr" aria-hidden="true">
            ✓
          </span>
          <p>{ui(lang, 'steg1')}</p>
        </li>
        <li class="no anim">
          <span class="nr" aria-hidden="true">
            2
          </span>
          <p>{ui(lang, 'steg2', { k: client ?? '' })}</p>
        </li>
        <li class="anim">
          <span class="nr" aria-hidden="true">
            3
          </span>
          <p>{ui(lang, 'steg3')}</p>
        </li>
      </ol>
      <ContactCard contact={contact} lang={lang} />
      <p class="lukk anim">{ui(lang, 'lukk')}</p>
    </div>
  );
}
