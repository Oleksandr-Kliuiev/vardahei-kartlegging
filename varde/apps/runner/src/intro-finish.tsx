import { evaluate, prune, type Answers } from '@varde/rules/runner';
import type { TemplateContent } from '@varde/schema/template/template';
import type { Lang } from '@varde/schema/template/texts';
import nn from './i18n/notice-v2.nn.json';
import { notice } from './i18n/notice.js';
import { text, ui } from './i18n/ui.js';

export function Intro({
  version,
  client,
  lang,
  start,
}: {
  version: TemplateContent;
  client: string;
  lang: Lang;
  start: () => void;
}) {
  const prefix = version.identification === 'initials' ? 'notice.identified.' : 'notice.anonymous.';
  const notices = (Object.keys(nn) as (keyof typeof nn)[]).filter(
    (k) => k.startsWith(prefix) || k.startsWith('notice.common.'),
  );
  return (
    <div class="skjerm brev">
      <div class="ingress">{text(version.intro.short, lang)}</div>
      <h1>{text(version.intro.title, lang)}</h1>
      {version.intro.letter.map((p) => (
        <p>{text(p, lang)}</p>
      ))}
      <p>
        {ui(lang, 'for')} <span class="kunde">{client}</span>.
      </p>
      <ul class="fakta">
        <li>
          <span aria-hidden="true">◷</span>
          <span>{ui(lang, 'f1', version.intro.minutes)}</span>
        </li>
        {version.intro.facts.slice(1).map((fact) => (
          <li>
            <span aria-hidden="true">✓</span>
            <span>{text(fact, lang)}</span>
          </li>
        ))}
      </ul>
      <div class="notis">
        {notices.map((key) => (
          <p data-notice={key}>{notice(lang, key)}</p>
        ))}
      </div>
      <p class="helsing">
        {ui(lang, 'helsing')} {text(version.intro.sender, lang)}
      </p>
      <button id="start" class="knapp hoved" onClick={start}>
        {ui(lang, 'start')}
      </button>
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
}: {
  version: TemplateContent;
  answers: Answers;
  lang: Lang;
}) {
  const scenarios = version.questions.filter((q) => 'scenario' in q && q.scenario !== undefined);
  const tips = selectedTips(version, answers),
    contact = version.intro.contact;
  return (
    <div class="skjerm slutt">
      <h1>{ui(lang, 'takk')}</h1>
      <p>{ui(lang, 'sendt')}</p>
      {scenarios.length > 0 && (
        <section data-section="scenarios">
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
        <section data-section="tips">
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
      <section>
        <h2>{ui(lang, 'kontakt')}</h2>
        <div class="kontakt">
          <span>{contact.name}</span>
          <span>{contact.phone}</span>
          <span>{contact.email}</span>
          <small>{text(contact.hours, lang)}</small>
        </div>
      </section>
      <p class="helsing">{ui(lang, 'lukk')}</p>
    </div>
  );
}
