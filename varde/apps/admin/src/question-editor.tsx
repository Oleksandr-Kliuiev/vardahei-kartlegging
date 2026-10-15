import { schemaMessage } from './schema-message.js';
import { useState } from 'react';
import type { Question } from '../../../packages/schema/src/template/question.js';
import {
  FieldIssues,
  JsonField,
  LocalText,
  ObjectFields,
  type Issue,
  type Json,
} from './editor-fields.js';

export const localized = (languages: string[], text = '') =>
  Object.fromEntries(languages.map((l) => [l, text])) as { nn: string; en?: string; nb?: string };
export function newQuestion(type: Question['type'], id: string, languages: string[]): Question {
  const texts = { text: localized(languages) },
    base = { id, part: 'common' as const, texts };
  if (type === 'single' || type === 'multi')
    return { ...base, type, options: [{ id: 'val1', texts: { text: localized(languages) } }] };
  if (type === 'text') return { ...base, type, single_line: true, max_length: 80 };
  const scale = {
    min: 0,
    max: type === 'nps' ? (10 as const) : 3,
    low: localized(languages),
    high: localized(languages),
  };
  return type === 'nps'
    ? { ...base, type, scale: { ...scale, min: 0, max: 10 } }
    : { ...base, type, scale, rows: [{ id: 'rad1', texts: { text: localized(languages) } }] };
}

function Condition({
  value,
  questions,
  onChange,
}: {
  value: unknown;
  questions: Question[];
  onChange: (v: Json | undefined) => void;
}) {
  const [ref, setRef] = useState(''),
    [answer, setAnswer] = useState('');
  return (
    <fieldset>
      <legend>Vis når</legend>
      <div className="knappar">
        <label>
          Spørsmål
          <select value={ref} onChange={(e) => setRef(e.target.value)}>
            <option value="">Vel spørsmål</option>
            {questions.map((q) => (
              <option key={q.id}>{q.id}</option>
            ))}
          </select>
        </label>
        <label>
          Svar-ID
          <input value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={!ref || !answer}
          onClick={() => onChange({ '==': [{ var: ref }, answer] })}
        >
          Er lik
        </button>
        <button
          type="button"
          disabled={!ref || !answer}
          onClick={() => onChange({ in: [answer, { var: ref }] })}
        >
          Inneheld
        </button>
        <button type="button" onClick={() => onChange(undefined)}>
          Vis alltid
        </button>
      </div>
      <JsonField
        key={JSON.stringify(value)}
        label="Vilkår som JSON"
        value={value ?? null}
        onChange={(v) => onChange(v ?? undefined)}
      />
    </fieldset>
  );
}

export function QuestionEditor({
  question: q,
  questions,
  index,
  languages,
  issues,
  onChange,
  onJsonChange,
}: {
  onJsonChange: (v: Json) => Promise<void>;
  question: Question;
  questions: Question[];
  index: number;
  languages: string[];
  issues: Issue[];
  onChange: (v: Question) => void;
}) {
  const path = ['questions', index];
  const set = (key: string, v: unknown) => {
    const next = { ...q, [key]: v };
    if (v === undefined) delete (next as unknown as Record<string, unknown>)[key];
    onChange(next);
  };
  return (
    <div className="editor-form">
      <label>
        Spørsmåls-ID
        <input value={q.id} onChange={(e) => set('id', e.target.value)} />
        <FieldIssues issues={issues} path={[...path, 'id']} />
      </label>
      <label>
        Spørsmålstype
        <select
          value={q.type}
          onChange={(e) =>
            onChange({
              ...newQuestion(e.target.value as Question['type'], q.id, languages),
              texts: q.texts,
              part: q.part,
            })
          }
        >
          <option value="single">Eitt val</option>
          <option value="multi">Fleire val</option>
          <option value="text">Tekst</option>
          <option value="scale">Skala</option>
          <option value="nps">NPS</option>
        </select>
      </label>
      <LocalText
        label="Spørsmålstekst"
        value={q.texts.text}
        languages={languages}
        onChange={(v) => onChange({ ...q, texts: { ...q.texts, text: v as { nn: string } } })}
      />
      <FieldIssues issues={issues} path={[...path, 'texts', 'text']} />
      <LocalText
        label="Seksjonstittel"
        value={q.texts.section_title ?? {}}
        languages={languages}
        onChange={(v) => {
          const texts = { ...q.texts };
          if (Object.values(v).some(Boolean)) texts.section_title = v as { nn: string };
          else delete texts.section_title;
          onChange({ ...q, texts });
        }}
      />
      <details>
        <summary>Hjelpetekst, plasshaldar og kortnamn</summary>
        {(['help', 'placeholder', 'short_label'] as const).map((field) => (
          <LocalText
            key={field}
            label={
              {
                help: 'Hjelpetekst',
                placeholder: 'Plasshaldar',
                short_label: 'Kortnamn i dashbordet',
              }[field]
            }
            value={q.texts[field] ?? {}}
            languages={field === 'short_label' ? ['nn'] : languages}
            onChange={(v) => {
              const texts = { ...q.texts };
              if (Object.values(v).some(Boolean)) texts[field] = v as { nn: string };
              else delete texts[field];
              onChange({ ...q, texts });
            }}
          />
        ))}
      </details>
      <label>
        Del
        <select value={q.part} onChange={(e) => set('part', e.target.value)}>
          <option value="common">Felles</option>
          <option value="leader">Leiar</option>
        </select>
      </label>
      <div className="knappar">
        {(['required', 'optional', 'identifier', 'role'] as const).map((flag) => (
          <label key={flag}>
            <input
              type="checkbox"
              checked={!!q[flag]}
              onChange={(e) => set(flag, e.target.checked ? true : undefined)}
            />
            {
              {
                required: 'Obligatorisk',
                optional: 'Valfri',
                identifier: 'Initialar',
                role: 'Rolle',
              }[flag]
            }
          </label>
        ))}
      </div>
      <Condition
        value={q.visible_if}
        questions={questions.filter((x) => x !== q)}
        onChange={(v) => set('visible_if', v)}
      />
      {(q.type === 'single' || q.type === 'multi') && (
        <fieldset>
          <legend>Svaralternativ</legend>
          {q.options.map((o, n) => (
            <fieldset key={n}>
              <legend>Alternativ {n + 1}</legend>
              <label>
                Alternativ-ID
                <input
                  value={o.id}
                  onChange={(e) =>
                    set(
                      'options',
                      q.options.map((x, i) => (i === n ? { ...x, id: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <LocalText
                label={`Alternativ ${n + 1}`}
                value={o.texts.text}
                languages={languages}
                onChange={(v) =>
                  set(
                    'options',
                    q.options.map((x, i) => (i === n ? { ...x, texts: { text: v } } : x)),
                  )
                }
              />
              <label>
                Risikoscore
                <select
                  value={o.score ?? ''}
                  onChange={(e) =>
                    set(
                      'options',
                      q.options.map((x, i) => {
                        if (i !== n) return x;
                        const next = { ...x };
                        if (e.target.value === '') delete next.score;
                        else next.score = Number(e.target.value);
                        return next;
                      }),
                    )
                  }
                >
                  <option value="">Ingen score</option>
                  {[0, 1, 2, 3].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <Condition
                value={o.visible_if}
                questions={questions}
                onChange={(v) =>
                  set(
                    'options',
                    q.options.map((x, i) => {
                      if (i !== n) return x;
                      const next: {
                        visible_if?: Json | undefined;
                        id: string;
                        texts: typeof x.texts;
                        score?: number | undefined;
                      } = { ...x };
                      if (v) next.visible_if = v;
                      else delete next.visible_if;
                      return next;
                    }),
                  )
                }
              />
              <button
                type="button"
                onClick={() =>
                  set(
                    'options',
                    q.options.filter((_, i) => i !== n),
                  )
                }
              >
                Fjern alternativ
              </button>
              <FieldIssues issues={issues} path={[...path, 'options', n, 'texts', 'text']} />
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              set('options', [
                ...q.options,
                { id: `val${q.options.length + 1}`, texts: { text: localized(languages) } },
              ])
            }
          >
            Legg til alternativ
          </button>
        </fieldset>
      )}
      {q.type === 'text' && (
        <fieldset>
          <legend>Tekstfelt</legend>
          <label>
            Maks teikn
            <input
              type="number"
              min={1}
              value={q.max_length ?? ''}
              onChange={(e) =>
                set('max_length', e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!q.single_line}
              onChange={(e) => set('single_line', e.target.checked ? true : undefined)}
            />
            Éi linje
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!q.uppercase}
              onChange={(e) => set('uppercase', e.target.checked ? true : undefined)}
            />
            Store bokstavar
          </label>
        </fieldset>
      )}
      {(q.type === 'scale' || q.type === 'nps') && (
        <ObjectFields
          value={q.scale}
          languages={languages}
          path={[...path, 'scale']}
          issues={issues}
          onChange={(v) => set('scale', v)}
        />
      )}
      {q.type === 'scale' && (
        <ObjectFields
          value={q.rows}
          languages={languages}
          path={[...path, 'rows']}
          issues={issues}
          onChange={(v) => set('rows', v)}
        />
      )}
      {q.type !== 'text' && (
        <fieldset>
          <legend>Fritekst</legend>
          <button
            type="button"
            onClick={() =>
              set('free_text', q.free_text ? undefined : { texts: { text: localized(languages) } })
            }
          >
            {q.free_text ? 'Fjern fritekst' : 'Legg til fritekst'}
          </button>
          {q.free_text && (
            <>
              <ObjectFields
                value={q.free_text}
                languages={languages}
                path={[...path, 'free_text']}
                issues={issues}
                onChange={(v) => set('free_text', v)}
              />
              {'options' in q && (
                <div>
                  Vis fritekst ved desse vala (ingen val = alltid):
                  {q.options.map((o) => (
                    <label key={o.id}>
                      <input
                        type="checkbox"
                        checked={q.free_text?.when?.includes(o.id) ?? false}
                        onChange={(e) => {
                          const selected = e.target.checked
                            ? [...(q.free_text?.when ?? []), o.id]
                            : (q.free_text?.when ?? []).filter((id) => id !== o.id);
                          const next = { ...q.free_text };
                          if (selected.length) next.when = selected;
                          else delete next.when;
                          set('free_text', next);
                        }}
                      />
                      {o.id}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </fieldset>
      )}
      <details>
        <summary>Alle spørsmålsfelt som JSON</summary>
        <JsonField key={q.id} label="Spørsmål som JSON" value={q} onChange={onJsonChange} />
      </details>
      {issues
        .filter((i) => i.path[0] === 'questions' && i.path[1] === index)
        .map((i, n) => (
          <small role="alert" key={n}>
            {i.path.slice(2).join('.')}: {schemaMessage(i.message)}
          </small>
        ))}
    </div>
  );
}
