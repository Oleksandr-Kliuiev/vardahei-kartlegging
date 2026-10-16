// Leader choice, review before sending, and the screens for a link that does not lead to a survey.
import { useState } from 'preact/hooks';
import { optionsFor, type Answers } from '@varde/rules/runner';
import type { Question } from '@varde/schema/template/question';
import type { TemplateContent } from '@varde/schema/template/template';
import type { Lang } from '@varde/schema/template/texts';
import { notice } from './i18n/notice.js';
import { text, ui } from './i18n/ui.js';
import { CairnMark, Icon } from './icons.js';
import { ContactCard, VARDAHEI_CONTACT } from './contact.js';

export function LeaderScreen({
  version,
  lang,
  count,
  error,
  sending,
  onTake,
  onSkip,
}: {
  version: TemplateContent;
  lang: Lang;
  count: number;
  error: boolean;
  sending: boolean;
  onTake: () => void;
  onSkip: () => void;
}) {
  return (
    <div class="skjerm mellom" data-step="B-intro">
      <div class="eyebrow anim">{ui(lang, 'leiarEyebrow')}</div>
      <h1 class="anim" tabIndex={-1}>
        {text(version.leader_intro.title, lang)}
      </h1>
      <p class="anim">{text(version.leader_intro.text, lang)}</p>
      <div class="aerleg anim">
        <Icon name="auge" />
        <p data-notice="leader">{notice(lang, 'notice.common.leader_not_anonymous')}</p>
      </div>
      {error && (
        <div role="alert" class="feilmelding anim">
          <Icon name="varsel" />
          <span>{ui(lang, 'sendFeil')}</span>
        </div>
      )}
      <div class="vegval">
        <button
          type="button"
          id="vidare"
          class="veg hoved anim"
          disabled={sending}
          onClick={onTake}
        >
          <b>{ui(lang, 'bStart')}</b>
          <span>{ui(lang, 'taDeiSub', count)}</span>
          <Icon name="pil" />
        </button>
        <button type="button" id="skip-leader" class="veg anim" disabled={sending} onClick={onSkip}>
          <b>{ui(lang, 'bHopp')}</b>
          <span>{ui(lang, 'hoppSendSub')}</span>
          <Icon name="pil" />
        </button>
      </div>
    </div>
  );
}

/** Answer as the respondent saw it: option texts, scale rows, NPS, or «Du hoppa over denne». */
export function answerText(q: Question, answers: Answers, lang: Lang): string {
  const v = answers[q.id];
  if (v === undefined || v === '') return ui(lang, 'hoppa');
  if (q.type === 'single' || q.type === 'multi') {
    const opts = optionsFor(q, answers),
      ids = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
    return ids.map((id) => text(opts.find((o) => o.id === id)?.texts.text, lang) || id).join(', ');
  }
  if (q.type === 'scale' && typeof v === 'object' && !Array.isArray(v))
    return q.rows.map((r) => `${text(r.texts.text, lang)}: ${v[r.id] ?? '–'}`).join(' · ');
  if (q.type === 'nps' && typeof v === 'number') return `${v} / 10`;
  return typeof v === 'string' || typeof v === 'number' ? `${v}` : '';
}

export function ReviewScreen({
  version,
  questions,
  answers,
  lang,
  error,
  locked,
  onEdit,
}: {
  version: TemplateContent;
  questions: Question[];
  answers: Answers;
  lang: Lang;
  error: boolean;
  locked: boolean;
  onEdit: (id: string) => void;
}) {
  const groups: { title: string; qs: Question[] }[] = [];
  let title = text(version.intro.short, lang);
  for (const q of questions) {
    const next = q.texts.section_title
      ? text(q.texts.section_title, lang)
      : q.part === 'leader'
        ? ui(lang, 'leiarEyebrow')
        : title;
    if (!groups.length || next !== title) groups.push({ title: next, qs: [] });
    title = next;
    groups.at(-1)!.qs.push(q);
  }
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div class="skjerm oversyn" data-step="review">
      <div class="eyebrow anim">{text(version.intro.short, lang)}</div>
      <h1 class="anim" tabIndex={-1}>
        {ui(lang, 'review')}
      </h1>
      <p class="lagra anim">
        <Icon name="hake" small />
        {ui(lang, 'ready')}
      </p>
      {error && (
        <div role="alert" class="feilmelding anim">
          <Icon name="varsel" />
          <span>{ui(lang, 'sendFeil')}</span>
        </div>
      )}
      <ol class="seksjonar">
        {groups.map((g, k) => {
          const answered = g.qs.filter((q) => answers[q.id] !== undefined).length;
          return (
            <li class="anim">
              <button
                type="button"
                class="seksjon-knapp"
                aria-expanded={open === k}
                aria-controls={`ss-${k}`}
                onClick={() => setOpen(open === k ? null : k)}
              >
                <CairnMark />
                <span>{g.title}</span>
                <span class="tal">{ui(lang, 'svart', { a: answered, n: g.qs.length })}</span>
                <span class="pil">
                  <Icon name="ned" small />
                </span>
              </button>
              <div class="seksjon-svar" id={`ss-${k}`} data-open={open === k ? 'true' : 'false'}>
                <div>
                  <dl>
                    {g.qs.map((q) => (
                      <div>
                        <dt>{text(q.texts.text, lang)}</dt>
                        <dd>
                          <span>{answerText(q, answers, lang)}</span>
                          {!locked && (
                            <button
                              type="button"
                              class="linkbtn"
                              data-edit={q.id}
                              onClick={() => onEdit(q.id)}
                            >
                              {ui(lang, 'endre')}
                            </button>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export type StateKind = 'invalid' | 'closed' | 'revoked' | 'offline' | 'loading';
const STATE: Record<
  Exclude<StateKind, 'loading'>,
  [
    'lenke' | 'mane' | 'varsel',
    'ugyldigTittel' | 'stengdTittel' | 'byttTittel' | 'nettTittel',
    'ugyldigTekst' | 'stengdTekst' | 'byttTekst' | 'nettTekst',
  ]
> = {
  invalid: ['lenke', 'ugyldigTittel', 'ugyldigTekst'],
  closed: ['mane', 'stengdTittel', 'stengdTekst'],
  revoked: ['lenke', 'byttTittel', 'byttTekst'],
  offline: ['varsel', 'nettTittel', 'nettTekst'],
};

export function StateScreen({ kind, lang }: { kind: StateKind; lang: Lang }) {
  if (kind === 'loading')
    return (
      <div class="skjerm tilstand" aria-busy="true">
        <div class="skel l1" />
        <div class="skel l2" />
        <div class="skel l3" />
        <p class="sr-only" role="status">
          {ui(lang, 'loading')}
        </p>
      </div>
    );
  const [icon, title, body] = STATE[kind];
  return (
    <div class="skjerm tilstand" data-state={kind}>
      <div class="ikon anim">
        <Icon name={icon} />
      </div>
      <h1 class="anim" tabIndex={-1}>
        {ui(lang, title)}
      </h1>
      <p class="anim">{ui(lang, body)}</p>
      <ContactCard contact={VARDAHEI_CONTACT} lang={lang} />
    </div>
  );
}
