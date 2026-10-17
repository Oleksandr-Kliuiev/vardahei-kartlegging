// «Når blir spørsmålet vist?» (2.15): rules as a sentence — question, comparison, answer — joined by
// «alle må stemme» or «eitt held». Rules being filled in live here; the content gets complete rules only.
// Conditions the rules cannot express stay as they are, shown in words, and change under «Teknisk».
import { useState } from 'react';
import type { Expression } from '../../../packages/schema/src/template/expression.js';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { Icon } from './icons.js';
import { Seg } from './widgets.js';
import { canonical } from './verkstad-model.js';
import {
  OPS,
  complete,
  conditionWords,
  expressionWords,
  readCondition,
  shortName,
  sourcesFor,
  writeCondition,
  type Condition,
  type Rule,
} from './verkstad-vilkar.js';

export function VilkarFelt({
  content,
  q,
  locked,
  onChange,
}: {
  content: TemplateContent;
  q: Question;
  locked: boolean;
  onChange: (visible: Expression | undefined) => void;
}) {
  const read = readCondition(q.visible_if);
  const start = (): Condition => (read && read !== 'avansert' ? read : { logic: 'og', rules: [] });
  const [draft, setDraft] = useState<Condition>(start);
  // The condition as this editor last wrote it: anything else came from outside (undo, «Teknisk», a
  // restored draft) and replaces the rules being filled in.
  const now = canonical(q.visible_if ?? null);
  const [synced, setSynced] = useState(now);
  if (now !== synced) {
    setSynced(now);
    setDraft(start());
  }
  const sources = sourcesFor(content, q);
  const update = (next: Condition) => {
    setDraft(next);
    const written = writeCondition(next);
    const w = canonical(written ?? null);
    if (w !== now) {
      setSynced(w);
      onChange(written);
    }
  };
  if (read === 'avansert')
    return (
      <div className="vk-blokk">
        <div className="vk-etikett">Når blir spørsmålet vist?</div>
        <div className="vk-vilkar">
          <p className="vk-setning">
            <Icon name="greiner" small />
            <span>{expressionWords(content, q.visible_if!)}</span>
          </p>
          <small className="vk-hint">
            Dette vilkåret tel eller samanliknar svar og blir endra under «Teknisk» nedanfor.
          </small>
        </div>
      </div>
    );
  const rules = draft.rules;
  const fresh = (): Rule => {
    const src = sources[sources.length - 1];
    return { q: src?.id ?? '', op: src?.type === 'multi' ? 'inneheld' : 'er', v: [] };
  };
  if (!rules.length)
    return (
      <div className="vk-blokk">
        <div className="vk-etikett">Når blir spørsmålet vist?</div>
        <div className="vk-alltid">
          <span>Alltid.</span>
          {!locked &&
            (sources.length ? (
              <button
                type="button"
                className="vk-lenkje"
                onClick={() => update({ logic: 'og', rules: [fresh()] })}
              >
                <Icon name="greiner" small />
                Legg til vilkår
              </button>
            ) : (
              <small className="vk-hint">
                Vilkår kan vise til spørsmål med val som kjem før dette.
              </small>
            ))}
        </div>
      </div>
    );
  const setRule = (i: number, r: Rule) =>
    update({ ...draft, rules: rules.map((x, n) => (n === i ? r : x)) });
  return (
    <div className="vk-blokk">
      <div className="vk-etikett">Når blir spørsmålet vist?</div>
      <div className="vk-vilkar">
        <p className="vk-setning">
          <Icon name="greiner" small />
          <span>
            {rules.some(complete)
              ? conditionWords(content, draft)
              : 'Vel spørsmål og svar, så står vilkåret her som ei setning.'}
          </span>
        </p>
        {rules.map((r, i) => {
          const src = sources.find((s) => s.id === r.q);
          const kind = src?.type === 'multi' ? 'multi' : 'single';
          const options = src && (src.type === 'single' || src.type === 'multi') ? src.options : [];
          return (
            <div className="vk-regel" key={i}>
              <span className="vk-regel-ord">
                {i === 0 ? 'Vis når' : draft.logic === 'og' ? 'og' : 'eller'}
              </span>
              <select
                className="input"
                aria-label={`Spørsmål i vilkår ${i + 1}`}
                value={r.q}
                disabled={locked}
                onChange={(e) => {
                  const next = sources.find((s) => s.id === e.target.value);
                  setRule(i, {
                    q: e.target.value,
                    op: next?.type === 'multi' ? 'inneheld' : 'er',
                    v: [],
                  });
                }}
              >
                <option value="">Vel spørsmål</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {`${s.id} ${shortName(s)}`}
                  </option>
                ))}
              </select>
              <select
                className="input"
                aria-label={`Samanlikning i vilkår ${i + 1}`}
                value={r.op}
                disabled={locked || !src}
                onChange={(e) =>
                  setRule(i, { ...r, op: e.target.value as Rule['op'], v: r.v.slice(0, 1) })
                }
              >
                {OPS[kind].map(([op, label]) => (
                  <option key={op} value={op}>
                    {label}
                  </option>
                ))}
              </select>
              {r.op === 'er_ein_av' ? (
                <fieldset className="vk-fleire" disabled={locked}>
                  <legend className="sr-only">Svar i vilkår {i + 1}</legend>
                  {options.map((o) => (
                    <label key={o.id} className="vk-sjekk">
                      <input
                        type="checkbox"
                        checked={r.v.includes(o.id)}
                        onChange={(e) =>
                          setRule(i, {
                            ...r,
                            v: e.target.checked ? [...r.v, o.id] : r.v.filter((v) => v !== o.id),
                          })
                        }
                      />
                      {o.texts.text.nn || o.id}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <select
                  className="input"
                  aria-label={`Svar i vilkår ${i + 1}`}
                  value={r.v[0] ?? ''}
                  disabled={locked || !src}
                  onChange={(e) => setRule(i, { ...r, v: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">Vel svar</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.texts.text.nn || o.id}
                    </option>
                  ))}
                </select>
              )}
              {!locked && (
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Fjern vilkår ${i + 1}`}
                  onClick={() => update({ ...draft, rules: rules.filter((_, n) => n !== i) })}
                >
                  <Icon name="lukk" small />
                </button>
              )}
            </div>
          );
        })}
        {!locked && (
          <div className="vk-vilkar-fot">
            <button
              type="button"
              className="vk-lenkje"
              onClick={() => update({ ...draft, rules: [...rules, fresh()] })}
            >
              <Icon name="pluss" small />
              Eitt vilkår til
            </button>
            {rules.length > 1 && (
              <Seg
                label="Korleis vilkåra heng saman"
                value={draft.logic}
                options={[
                  ['og', 'Alle må stemme'],
                  ['eller', 'Eitt held'],
                ]}
                onChange={(logic) => update({ ...draft, logic })}
              />
            )}
            <button
              type="button"
              className="vk-lenkje dempa"
              onClick={() => update({ logic: 'og', rules: [] })}
            >
              Vis alltid
            </button>
          </div>
        )}
        <small className="vk-hint">
          Berre spørsmål som kjem før dette, kan brukast. Då kan to spørsmål aldri vente på
          kvarandre.
        </small>
      </div>
    </div>
  );
}
