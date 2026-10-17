// The answers of a question in the workshop (2.15): rows that look like the runner's options, the risk
// score as four buttons in zone colours, Enter for the next answer and pasting several lines at once.
// Frozen questions keep their answers and scores; only the wording can change («Rett ordlyden»).
import { useEffect, useRef, useState } from 'react';
import type { Question } from '../../../packages/schema/src/template/question.js';
import { Icon } from './icons.js';
import { TekstFelt } from './verkstad-felt.js';
import { localized, nextOptionId, type Lang, type Text } from './verkstad-model.js';

type Choice = Extract<Question, { type: 'single' | 'multi' }>;
type Scaled = Extract<Question, { type: 'scale' | 'nps' }>;

export function Svar({
  q,
  lang,
  languages,
  locked,
  structureLocked,
  scored,
  onChange,
}: {
  q: Question;
  lang: Lang;
  languages: readonly Lang[];
  /** Nothing can change (published, or a frozen question before «Rett ordlyden»). */
  locked: boolean;
  /** Texts can change, the answers themselves cannot (frozen, role). */
  structureLocked: boolean;
  /** The risk score 0–3 belongs to this survey's zone model. */
  scored: boolean;
  onChange: (q: Question) => void;
}) {
  if (q.type === 'single' || q.type === 'multi')
    return (
      <Valg
        q={q}
        lang={lang}
        languages={languages}
        locked={locked}
        structureLocked={structureLocked}
        scored={scored}
        onChange={onChange}
      />
    );
  if (q.type === 'text')
    return (
      <div className="vk-blokk">
        <div className="vk-etikett">Svarfelt</div>
        <div className="vk-to">
          <label className="vk-sjekk">
            <input
              type="checkbox"
              checked={!!q.single_line}
              disabled={locked || structureLocked}
              onChange={(e) => {
                const next = { ...q };
                if (e.target.checked) next.single_line = true;
                else delete next.single_line;
                onChange(next);
              }}
            />
            Éi linje
          </label>
          <label className="vk-felt">
            Maks teikn
            <input
              className="input"
              type="number"
              min={1}
              value={q.max_length ?? ''}
              placeholder="Inga grense"
              readOnly={locked || structureLocked}
              onChange={(e) => {
                const next = { ...q };
                if (e.target.value) next.max_length = Math.max(1, Number(e.target.value));
                else delete next.max_length;
                onChange(next);
              }}
            />
          </label>
        </div>
        <TekstFelt
          label="Plasshaldar i feltet"
          text={q.texts.placeholder}
          lang={lang}
          readOnly={locked}
          onChange={(placeholder) => onChange({ ...q, texts: { ...q.texts, placeholder } })}
        />
        {q.identifier && (
          <small className="vk-hint">
            Initialane blir lagra som ID for personen: éi linje, høgst 8 teikn, i fellesdelen.
          </small>
        )}
      </div>
    );
  return (
    <Skala
      q={q}
      lang={lang}
      languages={languages}
      locked={locked}
      structureLocked={structureLocked}
      onChange={onChange}
    />
  );
}

function Valg({
  q,
  lang,
  languages,
  locked,
  structureLocked,
  scored,
  onChange,
}: {
  q: Choice;
  lang: Lang;
  languages: readonly Lang[];
  locked: boolean;
  structureLocked: boolean;
  scored: boolean;
  onChange: (q: Question) => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => {
    if (focus === null) return;
    inputs.current[focus]?.focus();
    setFocus(null);
  }, [focus, q.options.length]);
  const options = q.options;
  const set = (next: Choice['options']) => onChange({ ...q, options: next });
  const setText = (i: number, text: Text) =>
    set(options.map((o, n) => (n === i ? { ...o, texts: { text } } : o)));
  const add = (at: number, text = '') => {
    const id = nextOptionId(options.map((o) => o.id));
    const fresh = { id, texts: { text: { ...localized(languages), [lang]: text } } };
    set([...options.slice(0, at), fresh, ...options.slice(at)]);
    return at;
  };
  const remove = (i: number) => {
    if (options.length <= 1) return;
    set(options.filter((_, n) => n !== i));
  };
  const editable = !locked && !structureLocked;
  return (
    <div className="vk-blokk">
      <div className="vk-svar-hovud" aria-hidden="true">
        <span>Svar</span>
        {scored && <span>Risiko 0–3</span>}
      </div>
      <ol className={scored ? 'vk-svar med-risiko' : 'vk-svar'}>
        {options.map((o, i) => {
          const value = o.texts.text[lang] ?? '';
          return (
            <li key={o.id} className="vk-svarrad">
              <span
                className={q.type === 'multi' ? 'vk-glyf firkant' : 'vk-glyf'}
                aria-hidden="true"
              />
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                className={lang !== 'nn' && o.texts.text.nn && !value ? 'input manglar' : 'input'}
                value={value}
                placeholder={lang === 'nn' ? `Svar ${i + 1}` : o.texts.text.nn}
                aria-label={`Svar ${i + 1}`}
                readOnly={locked}
                onChange={(e) => setText(i, { ...o.texts.text, [lang]: e.target.value })}
                onKeyDown={(e) => {
                  if (!editable) return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const next = options[i + 1];
                    if (next && !(next.texts.text[lang] ?? '').trim()) setFocus(i + 1);
                    else setFocus(add(i + 1));
                  } else if (e.key === 'Backspace' && value === '' && options.length > 2) {
                    e.preventDefault();
                    remove(i);
                    setFocus(Math.max(0, i - 1));
                  }
                }}
                onPaste={(e) => {
                  if (!editable) return;
                  const lines = e.clipboardData
                    .getData('text')
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(Boolean);
                  if (lines.length < 2) return;
                  e.preventDefault();
                  let next = options.map((x, n) =>
                    n === i ? { ...x, texts: { text: { ...x.texts.text, [lang]: lines[0]! } } } : x,
                  );
                  lines.slice(1).forEach((line, k) => {
                    const id = nextOptionId(next.map((x) => x.id));
                    next = [
                      ...next.slice(0, i + 1 + k),
                      { id, texts: { text: { ...localized(languages), [lang]: line } } },
                      ...next.slice(i + 1 + k),
                    ];
                  });
                  set(next);
                  setFocus(i + lines.length - 1);
                }}
              />
              {scored ? (
                <div
                  className="vk-risiko"
                  role="group"
                  aria-label={`Risiko for ${o.texts.text.nn || `svar ${i + 1}`}`}
                >
                  {[0, 1, 2, 3].map((v) => (
                    <button
                      key={v}
                      type="button"
                      data-v={v}
                      aria-pressed={o.score === v}
                      disabled={!editable}
                      onClick={() =>
                        set(
                          options.map((x, n) => {
                            if (n !== i) return x;
                            const next = { ...x };
                            if (x.score === v) delete next.score;
                            else next.score = v;
                            return next;
                          }),
                        )
                      }
                    >
                      {v}
                    </button>
                  ))}
                </div>
              ) : (
                <span />
              )}
              {editable ? (
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Fjern svar ${i + 1}`}
                  title="Fjern svaret"
                  disabled={options.length <= 1}
                  onClick={() => remove(i)}
                >
                  <Icon name="lukk" small />
                </button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ol>
      {editable ? (
        <div className="vk-svar-fot">
          <button type="button" className="vk-lenkje" onClick={() => setFocus(add(options.length))}>
            <Icon name="pluss" small />
            Legg til svar
          </button>
          <small>Enter gir nytt svar. Lim inn fleire linjer for fleire svar.</small>
        </div>
      ) : (
        structureLocked &&
        !locked && (
          <small className="vk-hint">
            Svara og risikoscoren i faste spørsmål ligg fast. Du kan rette ordlyden.
          </small>
        )
      )}
      {scored && editable && (
        <small className="vk-hint">
          Risikoscoren går inn i sonene: 0 grøn, 1 gul, 2 oransje, 3 raud. Trykk på same tal igjen
          for å fjerne han.
        </small>
      )}
      {q.type === 'multi' && (
        <label className="vk-felt vk-smal">
          Høgst tal val
          <input
            className="input"
            type="number"
            min={1}
            value={q.max_choices ?? ''}
            placeholder="Alle"
            readOnly={!editable}
            onChange={(e) => {
              const next = { ...q };
              if (e.target.value) next.max_choices = Math.max(1, Number(e.target.value));
              else delete next.max_choices;
              onChange(next);
            }}
          />
        </label>
      )}
    </div>
  );
}

function Skala({
  q,
  lang,
  languages,
  locked,
  structureLocked,
  onChange,
}: {
  q: Scaled;
  lang: Lang;
  languages: readonly Lang[];
  locked: boolean;
  structureLocked: boolean;
  onChange: (q: Question) => void;
}) {
  const editable = !locked && !structureLocked;
  const scale = q.scale;
  return (
    <div className="vk-blokk">
      <div className="vk-etikett">
        {q.type === 'nps' ? 'Skala 0–10 (NPS)' : `Skala ${scale.min}–${scale.max}`}
      </div>
      <div className="vk-to">
        <TekstFelt
          label={`Tekst ved ${scale.min}`}
          text={scale.low}
          lang={lang}
          readOnly={locked}
          onChange={(low) => onChange({ ...q, scale: { ...scale, low } } as Question)}
        />
        <TekstFelt
          label={`Tekst ved ${scale.max}`}
          text={scale.high}
          lang={lang}
          readOnly={locked}
          onChange={(high) => onChange({ ...q, scale: { ...scale, high } } as Question)}
        />
      </div>
      {q.type === 'scale' && (
        <>
          <div className="vk-to">
            {(['min', 'max'] as const).map((k) => (
              <label key={k} className="vk-felt">
                {k === 'min' ? 'Lågaste tal' : 'Høgaste tal'}
                <input
                  className="input"
                  type="number"
                  value={scale[k]}
                  readOnly={!editable}
                  onChange={(e) =>
                    onChange({ ...q, scale: { ...scale, [k]: Number(e.target.value) } })
                  }
                />
              </label>
            ))}
          </div>
          <div className="vk-etikett">Rader</div>
          {q.rows.map((r, i) => (
            <div key={r.id} className="vk-rad-tekst">
              <TekstFelt
                label={`Rad ${i + 1}`}
                text={r.texts.text}
                lang={lang}
                readOnly={locked}
                placeholder={q.rows.length === 1 ? 'Kan stå tom når skalaen har éi rad' : undefined}
                onChange={(text) =>
                  onChange({
                    ...q,
                    rows: q.rows.map((x, n) => (n === i ? { ...x, texts: { text } } : x)),
                  })
                }
              />
              {editable && q.rows.length > 1 && (
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Fjern rad ${i + 1}`}
                  onClick={() => onChange({ ...q, rows: q.rows.filter((_, n) => n !== i) })}
                >
                  <Icon name="lukk" small />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <button
              type="button"
              className="vk-lenkje"
              onClick={() =>
                onChange({
                  ...q,
                  rows: [
                    ...q.rows,
                    {
                      id: nextOptionId(
                        q.rows.map((r) => r.id),
                        'r',
                      ),
                      texts: { text: localized(languages) },
                    },
                  ],
                })
              }
            >
              <Icon name="pluss" small />
              Legg til rad
            </button>
          )}
        </>
      )}
    </div>
  );
}
