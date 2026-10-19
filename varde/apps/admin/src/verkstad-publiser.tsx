// «Gjer klar til publisering» (2.15): one panel that says what is left — issues with «Gå til», changed
// frozen questions and their kind, proofreading and translations — and publishes by holding the button,
// like the other actions that cannot be undone. After publishing: the next step is a round.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { Icon } from './icons.js';
import { HoldButton } from './widgets.js';
import { LANG_NAME, issueText, type Issue } from './verkstad-felt.js';
import type { RespondentText } from '../../../packages/schema/src/template/respondent-texts.js';
import {
  issueNode,
  missingIn,
  nodeOfOwner,
  whereOf,
  type FrozenChange,
  type Lang,
} from './verkstad-model.js';
import { changedSince, type QuestionDiff } from './verkstad-tekst.js';
import type { EditorVersion } from './survey-models.js';
import { longDate } from './overview.js';

const time = (iso: string) => {
  const d = new Date(iso);
  return `${longDate(d)} kl. ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
};

export interface PubliserProps {
  saved: EditorVersion;
  content: TemplateContent;
  dirty: boolean;
  issues: readonly Issue[];
  frozen: readonly FrozenChange[];
  marks: Readonly<Record<string, 'orthographic'>>;
  /** Texts a respondent would meet empty. */
  empty: readonly RespondentText[];
  /** Questions new, changed and removed since the published version. */
  diff: QuestionDiff;
  baseLabel: string;
  languages: readonly Lang[];
  busy: boolean;
  error: string;
  onGoto: (key: string) => void;
  onLang: (lang: Lang) => void;
  onTranslations: () => void;
  onMark: (id: string, kind: 'orthographic' | 'semantic') => void;
  onAccept: (lang: Lang) => void;
  onPublish: () => void;
  /** The draft is the survey's only version: discarding it removes the survey too. */
  onlyVersion: boolean;
  onDiscard: () => void;
  onRound: () => void;
  onClose: () => void;
}

function Punkt({
  ok,
  title,
  children,
}: {
  ok: boolean | 'info';
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`vk-punkt ${ok === 'info' ? 'info' : ok ? 'ok' : 'gjer'}`}>
      <span className="vk-punkt-status" aria-hidden="true">
        <Icon name={ok === 'info' ? 'info' : ok ? 'hake' : 'varsel'} small />
      </span>
      <div>
        <h3>
          {title}
          <span className="sr-only">
            {ok === true ? ' (ferdig)' : ok === false ? ' (ikkje ferdig)' : ''}
          </span>
        </h3>
        {children}
      </div>
    </section>
  );
}

/** «Slett utkastet»: a quiet button under publishing; one more press, with the consequence in words. */
function Forkast(p: { no: number; onlyVersion: boolean; busy: boolean; onDiscard: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button
        type="button"
        className="btn sm ghost fare vk-forkast"
        disabled={p.busy}
        onClick={() => setAsking(true)}
      >
        <Icon name="slett" small />
        Slett utkastet
      </button>
    );
  return (
    <div className="vk-forkast-sporsmal" role="group" aria-label="Stadfest sletting av utkastet">
      <p>
        {p.onlyVersion
          ? 'Dette er den einaste versjonen, så heile skjemaet blir borte frå lista saman med utkastet.'
          : `Utkastet v${p.no} blir sletta. Publiserte versjonar og rundar blir ikkje rørt.`}{' '}
        Du finn det att i papirkorga.
      </p>
      <div className="vk-knappar">
        <button type="button" className="btn sm fare" disabled={p.busy} onClick={p.onDiscard}>
          <Icon name="slett" small />
          {p.onlyVersion ? 'Slett skjemaet' : `Slett utkastet v${p.no}`}
        </button>
        <button type="button" className="btn sm ghost" onClick={() => setAsking(false)}>
          Avbryt
        </button>
      </div>
    </div>
  );
}

export function Publiser(p: PubliserProps) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  const published = p.saved.status === 'published';
  const no = p.saved.version_no;
  if (published)
    return (
      <aside className="vk-skuff" role="dialog" aria-modal="true" aria-labelledby="vk-pub-tittel">
        <header className="vk-skuff-topp">
          <h2 id="vk-pub-tittel">Publisert</h2>
          <button
            ref={close}
            type="button"
            className="iconbtn"
            aria-label="Lukk"
            onClick={p.onClose}
          >
            <Icon name="lukk" />
          </button>
        </header>
        <div className="vk-skuff-innhald vk-ferdig">
          <span className="vk-ferdig-merke" aria-hidden="true">
            <Icon name="hake" />
          </span>
          <p className="vk-ferdig-tittel" role="status">
            v{no} er publisert
          </p>
          <p>
            {p.content.intro.title.nn}
            {p.saved.published_at ? ` · ${time(p.saved.published_at)}` : ''}. Versjonen er låst.
            Rundar som alt er i gang, held fram med versjonen dei har.
          </p>
          <div className="vk-knappar">
            <button type="button" className="btn primary" onClick={p.onRound}>
              <Icon name="flagg" small />
              Start ein runde med v{no}
            </button>
            <button type="button" className="btn" onClick={p.onClose}>
              Tilbake til skjemaet
            </button>
          </div>
        </div>
      </aside>
    );
  const pending = p.frozen.filter((f) => !f.semantic && !p.marks[f.id]);
  const acceptance = (lang: Lang) =>
    p.dirty ? undefined : (p.saved.translation_acceptance[lang] as { at?: string } | undefined);
  const missing = (lang: Lang) => missingIn(p.content, lang).length;
  const languagesDone = p.languages.every((l) => acceptance(l) && !missing(l));
  // Everything that keeps the survey from being whole: schema issues and empty texts, each with its place.
  const gaps = [
    ...p.issues.map((i) => ({
      what: issueText(i),
      where: whereOf(p.content, i.path),
      node: issueNode(p.content, i.path),
    })),
    ...p.empty.map((t) => ({
      what: 'Teksten er tom.',
      where: t.where,
      node: nodeOfOwner(t.owner),
    })),
  ];
  const ready = !gaps.length && !pending.length && languagesDone && !p.dirty;
  const shown = gaps.slice(0, 8);
  const name = (who: string | undefined) =>
    who ? (p.saved.people?.[who] ?? 'ein administrator') : '';
  const changes = p.diff.added.length + p.diff.changed.length + p.diff.removed.length;
  return (
    <aside className="vk-skuff" role="dialog" aria-modal="true" aria-labelledby="vk-pub-tittel">
      <header className="vk-skuff-topp">
        <h2 id="vk-pub-tittel">Klar til å publisere v{no}?</h2>
        <button ref={close} type="button" className="iconbtn" aria-label="Lukk" onClick={p.onClose}>
          <Icon name="lukk" />
        </button>
      </header>
      <div className="vk-skuff-innhald">
        <Punkt
          ok={!gaps.length}
          title={gaps.length ? `${gaps.length} ting må fiksast` : 'Skjemaet er heilt'}
        >
          {gaps.length ? (
            <ul className="vk-punktliste">
              {shown.map((g, n) => (
                <li key={n}>
                  <span>
                    {g.what} <span className="vk-dempa">({g.where})</span>
                  </span>
                  <button type="button" className="btn sm ghost" onClick={() => p.onGoto(g.node)}>
                    Gå til
                  </button>
                </li>
              ))}
              {gaps.length > shown.length && (
                <li className="vk-dempa">… og {gaps.length - shown.length} til</li>
              )}
            </ul>
          ) : (
            <p>Alle spørsmål har tekst og svar, og vilkåra viser til spørsmål som finst.</p>
          )}
        </Punkt>
        {p.saved.version_no > 1 && (
          <Punkt ok="info" title={`Endringar sidan ${p.baseLabel}`}>
            {changes ? (
              <ul className="vk-punktliste">
                {[
                  ...p.diff.added.map((q) => ['Ny', q] as const),
                  ...p.diff.changed.map(({ now }) => ['Endra', now] as const),
                ]
                  .slice(0, 8)
                  .map(([kind, q]) => (
                    <li key={`${kind}-${q.id}`}>
                      <span>
                        <span className={kind === 'Ny' ? 'chip accent' : 'chip warn'}>{kind}</span>{' '}
                        <b>{q.id}</b> {q.texts.text.nn || 'utan tekst'}
                      </span>
                      <button type="button" className="btn sm ghost" onClick={() => p.onGoto(q.id)}>
                        Gå til
                      </button>
                    </li>
                  ))}
                {p.diff.removed.map((q) => (
                  <li key={`f-${q.id}`}>
                    <span>
                      <span className="chip">Fjerna</span> <b>{q.id}</b> {q.texts.text.nn}
                    </span>
                  </li>
                ))}
                {p.diff.added.length + p.diff.changed.length > 8 && (
                  <li className="vk-dempa">
                    … og {p.diff.added.length + p.diff.changed.length - 8} til
                  </li>
                )}
              </ul>
            ) : (
              <p>Ingen spørsmål er nye, endra eller fjerna. Rekkjefølgja kan vere ny.</p>
            )}
          </Punkt>
        )}
        <Punkt ok={!pending.length} title="Faste spørsmål">
          {p.frozen.length ? (
            <ul className="vk-punktliste">
              {p.frozen.map((f) => (
                <li key={f.id}>
                  <span>
                    <b>{f.id}</b>:{' '}
                    {f.semantic
                      ? 'ny meining'
                      : p.marks[f.id]
                        ? 'rettskriving'
                        : 'vel kva slags endring'}
                  </span>
                  <span className="vk-knappar">
                    <button
                      type="button"
                      className="btn sm"
                      aria-pressed={!f.semantic && !!p.marks[f.id]}
                      onClick={() => p.onMark(f.id, 'orthographic')}
                    >
                      Rettskriving
                    </button>
                    <button
                      type="button"
                      className="btn sm"
                      aria-pressed={f.semantic}
                      onClick={() => p.onMark(f.id, 'semantic')}
                    >
                      Ny meining
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Ingen faste spørsmål er endra.</p>
          )}
        </Punkt>
        {p.languages.map((lang) => {
          const a = acceptance(lang),
            m = missing(lang),
            basis = p.saved.acceptance_basis?.[lang],
            after = a ? [] : changedSince(basis, p.content, lang);
          return (
            <Punkt
              key={lang}
              ok={!!a && !m}
              title={lang === 'nn' ? 'Korrektur på nynorsk' : `Omsetjing til ${LANG_NAME[lang]}`}
            >
              {m ? (
                <p>
                  {m} {m === 1 ? 'tekst manglar' : 'tekstar manglar'}.{' '}
                  <button type="button" className="linkbtn" onClick={() => p.onLang(lang)}>
                    Skriv på {LANG_NAME[lang]}
                  </button>
                </p>
              ) : a?.at ? (
                <p>
                  Godkjend av {name((a as { accepted_by?: string }).accepted_by)} {time(a.at)}. Ei
                  ny endring tek bort godkjenninga.
                </p>
              ) : (
                <>
                  {basis && after.length > 0 && (
                    <p>
                      {after.length} {after.length === 1 ? 'tekst er endra' : 'tekstar er endra'}{' '}
                      etter at {name(basis.by)} godkjende {time(basis.at)}:{' '}
                      {after
                        .slice(0, 3)
                        .map((t) => t.where)
                        .join(', ')}
                      {after.length > 3 ? ' …' : ''}{' '}
                      <button type="button" className="linkbtn" onClick={p.onTranslations}>
                        Sjå dei i Omsetjing
                      </button>
                    </p>
                  )}
                  <p>
                    {lang === 'nn'
                      ? 'Les gjennom teksten i telefonen eller her, og merk han som lesen.'
                      : `Sjekk den engelske teksten mot nynorsken.`}
                  </p>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={p.busy || gaps.length > 0}
                    onClick={() => p.onAccept(lang)}
                  >
                    {lang === 'nn' ? 'Eg har lese korrektur' : `Godkjenn ${LANG_NAME[lang]}`}
                  </button>
                  {gaps.length > 0 && <p className="vk-dempa">Fiks punkta over først.</p>}
                </>
              )}
            </Punkt>
          );
        })}
      </div>
      <footer className="vk-skuff-fot">
        {p.error && (
          <p role="alert" className="vk-problem">
            <Icon name="varsel" small />
            {p.error}
          </p>
        )}
        {!ready && (
          <p className="vk-dempa vk-grunn-tekst">Knappen blir aktiv når punkta over er ferdige.</p>
        )}
        <HoldButton
          className="primary"
          label={`Hald inne for å publisere v${no}`}
          hint="Hald knappen inne i litt over eitt sekund. Versjonen blir låst; rundar som alt er i gang, held fram med versjonen dei har."
          disabled={!ready || p.busy}
          onConfirm={p.onPublish}
        />
        <Forkast no={no} onlyVersion={p.onlyVersion} busy={p.busy} onDiscard={p.onDiscard} />
      </footer>
    </aside>
  );
}
