// «Omsetjing» (2.16): every text of the survey in one table — Nynorsk beside each translation — with
// the filters «Manglar» and «Endra etter godkjenning», and who approved each language and when.
import { Fragment, memo, useMemo, useState } from 'react';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { respondentTexts } from '../../../packages/schema/src/template/respondent-texts.js';
import { Icon } from './icons.js';
import { longDate } from './overview.js';
import type { EditorVersion } from './survey-models.js';
import { LANG_NAME } from './verkstad-felt.js';
import type { Lang } from './verkstad-model.js';
import { changedSince } from './verkstad-tekst.js';

type Filter = 'alle' | 'manglar' | 'endra';
const FILTER: Record<Filter, string> = {
  alle: 'Alle',
  manglar: 'Manglar',
  endra: 'Endra etter godkjenning',
};
export const when = (iso: string) => {
  const d = new Date(iso);
  return `${longDate(d)} kl. ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
};

export function Omsetjing(p: {
  content: TemplateContent;
  saved: EditorVersion;
  languages: readonly Lang[];
  readOnly: boolean;
  /** Stable: writes one text in one language. */
  onText: (key: string, lang: Lang, value: string) => void;
  /** Stable: the trail node of a text's owner, back in the workshop. */
  onGoto: (owner: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('alle');
  const rows = useMemo(() => respondentTexts(p.content), [p.content]);
  const others = p.languages.filter((l) => l !== 'nn');
  const basis = p.saved.acceptance_basis ?? {};
  const changed = useMemo(() => {
    const out = new Map<string, Lang[]>();
    for (const l of p.languages)
      for (const t of changedSince(basis[l], p.content, l))
        out.set(t.key, [...(out.get(t.key) ?? []), l]);
    return out;
  }, [p.content, basis, p.languages]);
  const missing = (t: (typeof rows)[number]) =>
    t.text.nn.trim() !== '' && others.some((l) => !(t.text[l] ?? '').trim());
  const shown = rows.filter((t) =>
    filter === 'manglar' ? missing(t) : filter === 'endra' ? changed.has(t.key) : true,
  );
  const count = { alle: rows.length, manglar: rows.filter(missing).length, endra: changed.size };
  const name = (who: string | undefined) =>
    who ? (p.saved.people?.[who] ?? 'ein administrator') : '';
  return (
    <section className="vk-rute vk-omsetjing" aria-labelledby="vk-oms-tittel">
      <header className="vk-oms-topp">
        <h2 id="vk-oms-tittel">Omsetjing</h2>
        <div className="vk-oms-filter" role="group" aria-label="Vis tekstar">
          {(['alle', 'manglar', 'endra'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className="vk-oms-val"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {FILTER[f]} {count[f]}
            </button>
          ))}
        </div>
      </header>
      <ul className="vk-oms-status">
        {p.languages.map((l) => {
          const a = p.saved.translation_acceptance[l] as
            { at?: string; accepted_by?: string } | undefined;
          const b = basis[l];
          const n = changedSince(b, p.content, l).length;
          return (
            <li key={l}>
              <b>{l === 'nn' ? 'Korrektur på nynorsk' : `Omsetjing til ${LANG_NAME[l]}`}:</b>{' '}
              {a?.at
                ? `godkjend av ${name(a.accepted_by)} ${when(a.at)}`
                : b
                  ? `${n} ${n === 1 ? 'tekst er endra' : 'tekstar er endra'} etter at ${name(b.by)} godkjende ${when(b.at)}`
                  : 'ikkje godkjend enno'}
            </li>
          );
        })}
      </ul>
      <div
        className={`vk-oms-tabell vk-oms-${others.length}`}
        role="table"
        aria-label="Alle tekstar"
      >
        <div className="vk-oms-rad vk-oms-hovud" role="row">
          <span role="columnheader">Stad</span>
          <span role="columnheader">Nynorsk</span>
          {others.map((l) => (
            <span key={l} role="columnheader">
              {LANG_NAME[l]}
            </span>
          ))}
        </div>
        {shown.map((t) => (
          <Rad
            key={t.key}
            k={t.key}
            owner={t.owner}
            where={t.where}
            nn={t.text.nn}
            en={t.text.en}
            nb={t.text.nb}
            others={others.join(',')}
            changed={(changed.get(t.key) ?? []).join(',')}
            readOnly={p.readOnly}
            onText={p.onText}
            onGoto={p.onGoto}
          />
        ))}
        {!shown.length && (
          <p className="vk-oms-tom" role="status">
            {filter === 'manglar'
              ? 'Ingen tekstar manglar.'
              : 'Ingen tekstar er endra etter godkjenninga.'}
          </p>
        )}
      </div>
    </section>
  );
}

/** One text: only its own words are compared, so typing in one row redraws that row. */
const Rad = memo(function Rad(r: {
  k: string;
  owner: string;
  where: string;
  nn: string;
  en: string | undefined;
  nb: string | undefined;
  others: string;
  changed: string;
  readOnly: boolean;
  onText: (key: string, lang: Lang, value: string) => void;
  onGoto: (owner: string) => void;
}) {
  const langs = r.others ? (r.others.split(',') as Lang[]) : [];
  const changed = r.changed ? r.changed.split(',') : [];
  const field = (l: Lang) => (
    <span role="cell" className="vk-oms-celle">
      <textarea
        className="input"
        rows={1}
        aria-label={`${r.where}, ${LANG_NAME[l]}`}
        readOnly={r.readOnly}
        value={(l === 'nn' ? r.nn : l === 'en' ? r.en : r.nb) ?? ''}
        placeholder={l === 'nn' ? '' : r.nn}
        onChange={(e) => r.onText(r.k, l, e.target.value)}
      />
      {changed.includes(l) && <small className="vk-oms-endra">Endra etter godkjenning</small>}
    </span>
  );
  return (
    <div className="vk-oms-rad" role="row">
      <span role="rowheader" className="vk-oms-stad">
        <button type="button" className="vk-lenkje" onClick={() => r.onGoto(r.owner)}>
          {r.where}
          <Icon name="chev" small />
        </button>
      </span>
      {field('nn')}
      {langs.map((l) => (
        <Fragment key={l}>{field(l)}</Fragment>
      ))}
    </div>
  );
});
