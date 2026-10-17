// One question in the workshop (2.15): the text as the respondent reads it, the answers, who gets it,
// when it is shown, and the technical details last. Frozen questions (F1–F22) are locked until
// «Rett ordlyden»; a changed wording then asks whether it is spelling or a new meaning.
import { useState } from 'react';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { Icon, type IconName } from './icons.js';
import { Seg } from './widgets.js';
import { AndreSprak, TekstFelt, issueText, type Issue } from './verkstad-felt.js';
import {
  changeType,
  leaderOf,
  sectionsOf,
  whereOf,
  type FrozenChange,
  type Lang,
  type QuestionType,
} from './verkstad-model.js';
import { Cairn } from './verkstad-sti.js';
import { Svar } from './verkstad-svar.js';
import { VilkarFelt } from './verkstad-vilkar-felt.js';

const TYPES: readonly (readonly [QuestionType, string, IconName])[] = [
  ['single', 'Eitt val', 't_single'],
  ['multi', 'Fleire val', 't_multi'],
  ['scale', 'Skala', 't_scale'],
  ['nps', 'NPS', 't_nps'],
  ['text', 'Tekst', 't_text'],
];

export interface SporsmalProps {
  content: TemplateContent;
  q: Question;
  lang: Lang;
  languages: readonly Lang[];
  readOnly: boolean;
  issues: readonly Issue[];
  /** The change of this frozen question against the published version, if any. */
  frozen: FrozenChange | undefined;
  unlocked: boolean;
  mark: 'orthographic' | 'semantic' | undefined;
  /** «Rettskriving» was chosen for an earlier wording. */
  markStale: boolean;
  baseLabel: string;
  scored: boolean;
  onChange: (q: Question) => void;
  onLang: (lang: Lang) => void;
  onUnlock: () => void;
  onMark: (kind: 'orthographic' | 'semantic') => void;
  onRevert: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (to: number | 'leader') => void;
}

export function Sporsmal(p: SporsmalProps) {
  const { q, content, lang } = p;
  const locked = p.readOnly || (!!q.frozen && !p.unlocked);
  const fixed = !!q.frozen || !!q.role || !!q.identifier;
  const sections = sectionsOf(content);
  const leader = leaderOf(content);
  const s = sections.findIndex((x) => x.questions.includes(q));
  const list = q.part === 'leader' ? leader : sections.flatMap((x) => x.questions);
  const position =
    q.part === 'leader'
      ? `Leiarspørsmål ${leader.indexOf(q) + 1} av ${leader.length}`
      : `Spørsmål ${list.indexOf(q) + 1} av ${list.length}`;
  const sectionTitle = s >= 0 ? sections[s]!.title?.nn : undefined;
  const textIssue = p.issues.find((i) => i.path.slice(2).join('.') === 'texts.text.nn');
  const other = p.issues.filter((i) => i !== textIssue);
  const ref = new RegExp(`"var":"${q.id}(\\.|")`);
  const users = content.questions.filter(
    (x) => x.visible_if !== undefined && ref.test(JSON.stringify(x.visible_if)),
  );
  const setTexts = (texts: Partial<Question['texts']>) =>
    p.onChange({ ...q, texts: { ...q.texts, ...texts } });
  return (
    <article className="vk-redigering" aria-labelledby={`vk-q-${q.id}`}>
      <header className="vk-hovud">
        <p className="vk-stad" id={`vk-q-${q.id}`}>
          <span className="vk-idmerke">{q.id}</span>
          <span>{position}</span>
          {sectionTitle && (
            <span className="vk-stad-seksjon">
              <Cairn />
              {sectionTitle}
            </span>
          )}
        </p>
        <p className="vk-merker">
          {q.frozen && (
            <span className="chip">
              <Icon name="las" small />
              Fast spørsmål
            </span>
          )}
          {q.part === 'leader' && <span className="chip accent">Leiardel</span>}
          {q.role && <span className="chip accent">Rolle</span>}
          {q.identifier && <span className="chip accent">Initialar</span>}
        </p>
      </header>
      {q.frozen && (
        <Fast
          q={q}
          lang={lang}
          readOnly={p.readOnly}
          unlocked={p.unlocked}
          change={p.frozen}
          mark={p.mark}
          markStale={p.markStale}
          baseLabel={p.baseLabel}
          onUnlock={p.onUnlock}
          onMark={p.onMark}
          onRevert={p.onRevert}
        />
      )}
      {q.role && (
        <p className="vk-info">
          <Icon name="info" small />
          Svaret her avgjer kven som får leiardelen. Kvart skjema har nøyaktig eitt rollespørsmål.
        </p>
      )}
      <div className="vk-blokk">
        <div className="vk-etikett" id={`vk-type-${q.id}`}>
          Type
        </div>
        <div className="vk-typar" role="group" aria-labelledby={`vk-type-${q.id}`}>
          {TYPES.map(([type, label, icon]) => (
            <button
              key={type}
              type="button"
              aria-pressed={q.type === type}
              className="vk-type"
              disabled={p.readOnly || fixed}
              onClick={() => p.onChange(changeType(q, type, p.languages))}
            >
              <Icon name={icon} small />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="vk-blokk">
        <TekstFelt
          label="Spørsmålet"
          big
          text={q.texts.text}
          lang={lang}
          readOnly={locked}
          placeholder={lang === 'nn' ? 'Skriv spørsmålet slik den som svarar ser det' : undefined}
          onChange={(text) => setTexts({ text })}
        />
        {lang === 'nn' && (
          <AndreSprak text={q.texts.text} languages={p.languages} onLang={p.onLang} />
        )}
        {textIssue && (
          <p className="vk-problem">
            <Icon name="varsel" small />
            {issueText(textIssue)}
          </p>
        )}
        {q.texts.help !== undefined ? (
          <TekstFelt
            label="Hjelpetekst"
            text={q.texts.help}
            lang={lang}
            readOnly={locked}
            onChange={(help) => setTexts({ help })}
          />
        ) : (
          !locked && (
            <button
              type="button"
              className="vk-lenkje"
              onClick={() => setTexts({ help: { nn: '' } })}
            >
              <Icon name="pluss" small />
              Legg til hjelpetekst
            </button>
          )
        )}
      </div>
      <Svar
        q={q}
        lang={lang}
        languages={p.languages}
        locked={locked}
        structureLocked={fixed}
        scored={p.scored && q.part === 'common' && !q.role && q.type === 'single'}
        onChange={p.onChange}
      />
      {other.length > 0 && (
        <ul className="vk-problemliste">
          {other.map((i, n) => (
            <li key={n} className="vk-problem">
              <Icon name="varsel" small />
              {issueText(i)}
              <span className="vk-dempa">
                {' '}
                ({whereOf(content, i.path).replace(`${q.id}: `, '')})
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="vk-to">
        <div className="vk-blokk">
          <div className="vk-etikett">Kven får spørsmålet?</div>
          {fixed || p.readOnly ? (
            <p>{q.part === 'leader' ? 'Berre leiarar' : 'Alle tilsette'}</p>
          ) : (
            <Seg
              label="Kven får spørsmålet"
              value={q.part}
              options={[
                ['common', 'Alle tilsette'],
                ['leader', 'Berre leiarar'],
              ]}
              onChange={(part) =>
                p.onMove(part === 'leader' ? 'leader' : Math.max(0, sections.length - 1))
              }
            />
          )}
        </div>
        <div className="vk-blokk">
          <div className="vk-etikett">Svar</div>
          <label className="vk-brytar">
            <input
              type="checkbox"
              checked={!!q.required}
              disabled={p.readOnly || fixed}
              onChange={(e) => {
                const next = { ...q };
                if (e.target.checked) next.required = true;
                else delete next.required;
                p.onChange(next);
              }}
            />
            Må svarast
          </label>
          <small className="vk-hint">
            {q.required ? 'Ingen «Hopp over» på telefonen.' : 'Den som svarar kan hoppe over.'}
          </small>
        </div>
      </div>
      <VilkarFelt
        content={content}
        q={q}
        locked={p.readOnly || fixed}
        onChange={(visible_if) => {
          const next = { ...q };
          if (visible_if === undefined) delete next.visible_if;
          else next.visible_if = visible_if;
          p.onChange(next);
        }}
      />
      {users.length > 0 && (
        <div className="vk-blokk">
          <div className="vk-etikett">Brukt i</div>
          <p className="vk-brukt">
            {users.map((u) => (
              <span key={u.id} className="chip accent">
                Vilkåret til {u.id}
              </span>
            ))}
          </p>
        </div>
      )}
      <Teknisk q={q} readOnly={locked || fixed} onApply={p.onChange} />
      {!p.readOnly && (
        <footer className="vk-fot">
          <div className="vk-fot-venstre">
            <button type="button" className="btn sm" onClick={p.onDuplicate}>
              <Icon name="kopi" small />
              Dupliser
            </button>
            <label className="sr-only" htmlFor={`vk-flytt-${q.id}`}>
              Flytt til
            </label>
            <select
              id={`vk-flytt-${q.id}`}
              className="input vk-flytt"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) p.onMove(v === 'leader' ? 'leader' : Number(v));
              }}
            >
              <option value="">Flytt til …</option>
              {sections.map((x, i) => (
                <option key={i} value={i} disabled={i === s}>
                  {x.title?.nn || `Seksjon ${i + 1}`}
                </option>
              ))}
              {!fixed && (
                <option value="leader" disabled={q.part === 'leader'}>
                  Berre for leiarar
                </option>
              )}
            </select>
          </div>
          {fixed ? (
            <span className="vk-grunn">
              <Icon name="las" small />
              {q.frozen
                ? 'Faste spørsmål kan ikkje slettast: dei held samanlikninga med tidlegare rundar.'
                : 'Rolle- og initialspørsmålet kan ikkje slettast.'}
            </span>
          ) : (
            <button type="button" className="btn sm ghost vk-slett" onClick={p.onDelete}>
              <Icon name="slett" small />
              Slett spørsmålet
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

function Fast({
  q,
  lang,
  readOnly,
  unlocked,
  change,
  mark,
  markStale,
  baseLabel,
  onUnlock,
  onMark,
  onRevert,
}: {
  q: Question;
  lang: Lang;
  readOnly: boolean;
  unlocked: boolean;
  change: FrozenChange | undefined;
  mark: 'orthographic' | 'semantic' | undefined;
  /** «Rettskriving» was chosen for an earlier wording. */
  markStale: boolean;
  baseLabel: string;
  onUnlock: () => void;
  onMark: (kind: 'orthographic' | 'semantic') => void;
  onRevert: () => void;
}) {
  if (!change)
    return (
      <div className="vk-banner">
        <Icon name="las" small />
        <div>
          <p>
            <b>Fast spørsmål.</b> Ordlyden ligg fast, slik at svara kan samanliknast med tidlegare
            rundar. Svara og risikoscoren kan ikkje endrast.
          </p>
          {!readOnly &&
            (unlocked ? (
              <p className="vk-dempa">
                Du kan no rette ordlyden. Når du har endra noko, vel du om det er rettskriving eller
                ny meining.
              </p>
            ) : (
              <button type="button" className="btn sm" onClick={onUnlock}>
                <Icon name="dok" small />
                Rett ordlyden
              </button>
            ))}
        </div>
      </div>
    );
  const kind = change.semantic ? 'semantic' : mark;
  const before = change.before.texts.text[lang] ?? change.before.texts.text.nn;
  const now = q.texts.text[lang] ?? q.texts.text.nn;
  return (
    <div className={kind ? 'vk-klassifiser ferdig' : 'vk-klassifiser'} id="vk-klassifiser">
      <p className="vk-klassifiser-tittel">
        {kind
          ? `Endringa i ${q.id} er merkt som ${kind === 'semantic' ? 'ny meining' : 'rettskriving'}.`
          : markStale
            ? `Du har endra ${q.id} etter at du valde «Rettskriving». Vel på nytt.`
            : `Du har endra ordlyden i ${q.id}. Kva slags endring er det?`}
      </p>
      {before !== now ? (
        <p className="vk-diff">
          <del>{before}</del>
          <ins>{now}</ins>
        </p>
      ) : (
        <p className="vk-dempa">
          Endringa er i eit av svara, i hjelpeteksten eller på eit anna språk.
        </p>
      )}
      {!readOnly && (
        <fieldset className="vk-val">
          <legend className="sr-only">Kva slags endring</legend>
          <label className="vk-valkort">
            <input
              type="radio"
              name={`merke-${q.id}`}
              checked={kind === 'orthographic'}
              onChange={() => onMark('orthographic')}
            />
            <span>
              <b>Rettskriving.</b> Same meining. Svara kan framleis samanliknast med tidlegare
              rundar.
            </span>
          </label>
          <label className="vk-valkort">
            <input
              type="radio"
              name={`merke-${q.id}`}
              checked={kind === 'semantic'}
              onChange={() => onMark('semantic')}
            />
            <span>
              <b>Ny meining.</b> Spørsmålet blir nytt i statistikken, og samanlikninga startar på
              nytt frå denne versjonen.
            </span>
          </label>
        </fieldset>
      )}
      {!readOnly && (
        <button type="button" className="vk-lenkje" onClick={onRevert}>
          <Icon name="angre" small />
          Set tilbake til ordlyden i {baseLabel}
        </button>
      )}
    </div>
  );
}

/** The question as the schema stores it; experts can paste a changed version (same id) and apply it. */
function Teknisk({
  q,
  readOnly,
  onApply,
}: {
  q: Question;
  readOnly: boolean;
  onApply: (q: Question) => void;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState('');
  return (
    <details className="vk-teknisk">
      <summary>
        <Icon name="chev" small />
        Fleire innstillingar og teknisk
      </summary>
      <div className="vk-teknisk-innhald">
        <label className="vk-felt">
          Kortnamn i dashbordet
          <input
            className="input"
            value={q.texts.short_label?.nn ?? ''}
            placeholder="Til dømes «Låser PC-en»"
            readOnly={readOnly}
            onChange={(e) => {
              const texts = { ...q.texts };
              if (e.target.value) texts.short_label = { nn: e.target.value };
              else delete texts.short_label;
              onApply({ ...q, texts });
            }}
          />
        </label>
        <p className="vk-hint">
          ID-en <code>{q.id}</code> blir laga av seg sjølv og endrar seg ikkje: funn, dashbord og
          vilkår viser til han.
          {q.anchor_key && (
            <>
              {' '}
              Ankernøkkel: <code>{q.anchor_key}</code>.
            </>
          )}
        </p>
        <label className="vk-felt">
          Spørsmålet slik det blir lagra (JSON)
          <textarea
            className="input vk-json"
            spellCheck={false}
            readOnly={readOnly}
            value={raw ?? JSON.stringify(q, null, 2)}
            onChange={(e) => {
              setRaw(e.target.value);
              setError('');
            }}
          />
        </label>
        {raw !== null && !readOnly && (
          <div className="vk-knappar">
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                try {
                  const parsed = JSON.parse(raw) as Question;
                  if (parsed.id !== q.id) throw new Error('ID-en kan ikkje endrast her.');
                  onApply(parsed);
                  setRaw(null);
                } catch (e) {
                  setError(
                    e instanceof SyntaxError
                      ? 'Skriv gyldig JSON.'
                      : e instanceof Error
                        ? e.message
                        : 'Kontroller JSON.',
                  );
                }
              }}
            >
              Bruk JSON
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setRaw(null)}>
              Avbryt
            </button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
