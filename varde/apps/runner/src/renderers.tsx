import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { optionsFor, type Answers, type AnswerValue } from '@varde/rules/runner';
import type { Question } from '@varde/schema/template/question';
import type { Lang } from '@varde/schema/template/texts';
import { animate, ease } from '@varde/ui/motion';
import { text, ui } from './i18n/ui.js';
import { CairnMark } from './icons.js';

export function canContinue(q: Question, value: AnswerValue | undefined): boolean {
  switch (q.type) {
    case 'single':
      return typeof value === 'string' && value !== '';
    case 'multi':
      return Array.isArray(value) && value.length >= (q.min_choices ?? 1);
    case 'text':
      return (
        !q.required || (typeof value === 'string' && value.trim().length >= (q.min_length ?? 2))
      );
    case 'nps':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10;
    case 'scale':
      return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        q.rows.every((r) => {
          const n = value[r.id];
          return (
            typeof n === 'number' && Number.isInteger(n) && n >= q.scale.min && n <= q.scale.max
          );
        })
      );
  }
}

/** Replacing an exclusive choice and selecting one always clear incompatible choices. */
export function toggleChoice(
  q: Extract<Question, { type: 'multi' }>,
  picked: string[],
  id: string,
): string[] {
  if (picked.includes(id)) return picked.filter((v) => v !== id);
  if (q.exclusive_options?.includes(id)) return [id];
  const rest = picked.filter((v) => !q.exclusive_options?.includes(v));
  return q.max_choices !== undefined && rest.length >= q.max_choices ? rest : [...rest, id];
}

interface Props {
  question: Question;
  answers: Answers;
  free: Record<string, string>;
  lang: Lang;
  /** Section heading over the question and «Spørsmål i av n». */
  section?: string | undefined;
  number?: { i: number; n: number } | undefined;
  onAnswer: (value: AnswerValue) => void;
  onFree: (value: string) => void;
  onAdvance: () => void;
}

const CHECK = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);
/** Short uppercase codes (initials) are typed into boxes, one letter each. */
const isBoxes = (q: Question) =>
  q.type === 'text' && q.single_line === true && q.uppercase === true && (q.max_length ?? 80) <= 8;

export function QuestionRenderer({
  question: q,
  answers,
  free,
  lang,
  section,
  number,
  onAnswer,
  onFree,
  onAdvance,
}: Props) {
  const value = answers[q.id];
  const [clicked, setClicked] = useState(false);
  // Cleanup on Back, Skip, language change or unmount; no stale timer can skip another question.
  useEffect(() => {
    if (!clicked || q.type !== 'single' || q.free_text !== undefined || !canContinue(q, value))
      return;
    const timer = setTimeout(onAdvance, 260);
    return () => clearTimeout(timer);
  }, [q.id, value, clicked]); // onAdvance captures the state corresponding to this answer

  const choices = optionsFor(q, answers);
  const picked =
    q.type === 'multi' && Array.isArray(value)
      ? value.filter((v) => choices.some((o) => o.id === v))
      : [];
  const freeText = 'free_text' in q ? q.free_text : undefined;
  const freeShown =
    freeText !== undefined &&
    (freeText.when === undefined ||
      freeText.when.some((id) => (Array.isArray(value) ? value.includes(id) : value === id)));

  return (
    <div
      class={`skjerm sporsmal${'scenario' in q && q.scenario ? ' scenario' : ''}`}
      data-question-id={q.id}
    >
      <div class="sp-hovud anim">
        {section ? (
          <span class="eyebrow seksjon">
            <CairnMark />
            {section}
          </span>
        ) : (
          <span />
        )}
        {number && <span class="sp-nr">{ui(lang, 'sporsmal', { i: number.i, n: number.n })}</span>}
      </div>
      <h1 class="sp anim" id={`sp-${q.id}`} tabIndex={-1}>
        {text(q.texts.text, lang)}
      </h1>
      {q.texts.help && <p class="hjelp anim">{text(q.texts.help, lang)}</p>}
      {q.type === 'multi' && q.max_choices && (
        <p class="hjelp anim">{ui(lang, 'maks', q.max_choices)}</p>
      )}
      {(q.type === 'single' || q.type === 'multi') && (
        <div
          class="val"
          role={q.type === 'single' ? 'radiogroup' : 'group'}
          aria-labelledby={`sp-${q.id}`}
        >
          {choices.map((o) => {
            const selected = q.type === 'multi' ? picked.includes(o.id) : value === o.id;
            const blocked =
              q.type === 'multi' &&
              !selected &&
              !q.exclusive_options?.includes(o.id) &&
              !picked.some((id) => q.exclusive_options?.includes(id)) &&
              q.max_choices !== undefined &&
              picked.length >= q.max_choices;
            return (
              <button
                type="button"
                class="opt anim"
                role={q.type === 'single' ? 'radio' : 'checkbox'}
                data-id={o.id}
                aria-checked={selected}
                disabled={blocked}
                onClick={() => {
                  onAnswer(q.type === 'single' ? o.id : toggleChoice(q, picked, o.id));
                  setClicked(true);
                }}
              >
                <span class="ind" aria-hidden="true">
                  {q.type === 'multi' && CHECK}
                </span>
                <span>{text(o.texts.text, lang)}</span>
              </button>
            );
          })}
        </div>
      )}
      {q.type === 'multi' && <Counter lang={lang} n={picked.length} max={q.max_choices} />}
      {q.type === 'text' &&
        (isBoxes(q) ? (
          <Boxes
            q={q}
            lang={lang}
            value={typeof value === 'string' ? value : ''}
            onAnswer={onAnswer}
          />
        ) : q.single_line ? (
          <input
            type="text"
            id={`tekst-${q.id}`}
            autoComplete="off"
            class={`felt anim${q.uppercase ? ' stor' : ''}`}
            aria-labelledby={`sp-${q.id}`}
            placeholder={text(q.texts.placeholder, lang)}
            maxLength={q.max_length ?? 80}
            value={typeof value === 'string' ? value : ''}
            onInput={(e) => {
              const field = e.currentTarget,
                position = field.selectionStart;
              const next = (q.uppercase ? field.value.toUpperCase() : field.value).slice(
                0,
                q.max_length ?? 80,
              );
              field.value = next;
              if (position !== null) field.setSelectionRange(position, position);
              onAnswer(next);
            }}
          />
        ) : (
          <FreeArea
            id={`tekst-${q.id}`}
            labelledBy={`sp-${q.id}`}
            lang={lang}
            max={q.max_length ?? 1500}
            optional={!q.required}
            placeholder={text(q.texts.placeholder, lang)}
            value={typeof value === 'string' ? value : ''}
            onInput={(v) =>
              onAnswer((q.uppercase ? v.toUpperCase() : v).slice(0, q.max_length ?? 1500))
            }
          />
        ))}
      {(q.type === 'scale' || q.type === 'nps') && (
        <div class={`skala anim${q.type === 'nps' ? ' nps' : ''}`}>
          {(q.type === 'scale' ? q.rows : [{ id: 'nps', texts: { text: q.texts.text } }]).map(
            (r) => {
              const selected =
                q.type === 'nps'
                  ? value
                  : typeof value === 'object' && value !== null && !Array.isArray(value)
                    ? value[r.id]
                    : undefined;
              const values = Array.from(
                { length: q.scale.max - q.scale.min + 1 },
                (_, i) => i + q.scale.min,
              );
              return (
                <div
                  class="skala-rad"
                  role="radiogroup"
                  aria-label={text(r.texts.text, lang)}
                  data-row={r.id}
                >
                  {q.type === 'scale' && <div class="namn">{text(r.texts.text, lang)}</div>}
                  <Track
                    values={values}
                    selected={typeof selected === 'number' ? selected : undefined}
                    onPick={(n) => {
                      const rows =
                        typeof value === 'object' && value !== null && !Array.isArray(value)
                          ? value
                          : {};
                      onAnswer(q.type === 'nps' ? n : { ...rows, [r.id]: n });
                    }}
                  />
                  <div class="skala-endar">
                    <span>{text(q.scale.low, lang)}</span>
                    <span>{text(q.scale.high, lang)}</span>
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}
      {freeText && (
        <div class="fri" hidden={!freeShown}>
          <label for={`fri-${q.id}`}>{text(freeText.texts.text, lang)}</label>
          <FreeArea
            id={`fri-${q.id}`}
            lang={lang}
            max={800}
            value={free[q.id] ?? ''}
            onInput={(v) => onFree(v.slice(0, 800))}
          />
        </div>
      )}
    </div>
  );
}

function Counter({ lang, n, max }: { lang: Lang; n: number; max: number | undefined }) {
  const el = useRef<HTMLDivElement>(null),
    last = useRef(n);
  useEffect(() => {
    if (n && n !== last.current)
      void animate(
        el.current,
        [
          { transform: 'translateY(4px)', opacity: 0.4 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 260, easing: ease.inn },
      );
    last.current = n;
  }, [n]);
  return (
    <div class="teljar" ref={el} aria-live="polite">
      {n ? (max ? ui(lang, 'valtMaks', { n, m: max }) : ui(lang, 'valt', { n })) : ''}
    </div>
  );
}

/** Initials: one box per letter; the real input lies over the boxes, so typing, paste and autofill work as usual. */
function Boxes({
  q,
  lang,
  value,
  onAnswer,
}: {
  q: Extract<Question, { type: 'text' }>;
  lang: Lang;
  value: string;
  onAnswer: (v: string) => void;
}) {
  const max = q.max_length ?? 8,
    slots = Math.max(5, Math.min(max, value.length));
  const placeholder = value.length ? '' : text(q.texts.placeholder, lang);
  const boxes = useRef<HTMLDivElement>(null),
    prev = useRef(value);
  useLayoutEffect(() => {
    const at = value.length - 1;
    if (value.length > prev.current.length && at >= 0)
      void animate(
        boxes.current?.children[at + 1] ?? null,
        [{ transform: 'scale(1.16)' }, { transform: 'none' }],
        { duration: 380, easing: ease.sprett },
      );
    prev.current = value;
  }, [value]);
  return (
    <div class="ruter anim" ref={boxes}>
      <input
        type="text"
        id={`tekst-${q.id}`}
        autoComplete="off"
        autoCapitalize="characters"
        spellcheck={false}
        aria-labelledby={`sp-${q.id}`}
        maxLength={max}
        value={value}
        onInput={(e) => {
          const field = e.currentTarget,
            next = field.value.toUpperCase().slice(0, max);
          field.value = next;
          onAnswer(next);
        }}
      />
      {Array.from({ length: slots }, (_, k) => {
        const ch = value[k] ?? '',
          ph = placeholder[k] ?? '';
        return (
          <span
            class={`rute${ch ? ' fylt' : ph ? ' plass' : ''}${k === value.length ? ' no' : ''}`}
            aria-hidden="true"
          >
            {ch || ph}
          </span>
        );
      })}
    </div>
  );
}

/** Free text that grows with its content; shows how much is left near the limit. */
function FreeArea({
  id,
  labelledBy,
  lang,
  max,
  optional,
  placeholder,
  value,
  onInput,
}: {
  id: string;
  labelledBy?: string;
  lang: Lang;
  max: number;
  optional?: boolean;
  placeholder?: string;
  value: string;
  onInput: (v: string) => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const ta = area.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(112, ta.scrollHeight + 2)}px`;
  }, [value]);
  const left = max - value.length;
  return (
    <>
      <textarea
        class="fritekst anim"
        id={id}
        ref={area}
        aria-labelledby={labelledBy}
        maxLength={max}
        rows={4}
        placeholder={placeholder}
        value={value}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
      {(optional || left < 200) && (
        <div class="fri-merk anim">
          <span>{optional ? ui(lang, 'valfritt') : ''}</span>
          <span aria-live="polite">{left < 200 ? ui(lang, 'teikn', left) : ''}</span>
        </div>
      )}
    </>
  );
}

/** Scale and NPS: a thumb glides to the chosen value. */
function Track({
  values,
  selected,
  onPick,
}: {
  values: number[];
  selected: number | undefined;
  onPick: (n: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null),
    thumb = useRef<HTMLSpanElement>(null),
    placed = useRef(false);
  useLayoutEffect(() => {
    const t = thumb.current,
      on = track.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!t) return;
    if (!on) {
      t.style.opacity = '0';
      return;
    }
    if (!placed.current) t.style.transition = 'none';
    t.style.width = `${on.offsetWidth}px`;
    t.style.transform = `translateX(${on.offsetLeft}px) scale(1)`;
    t.style.opacity = '1';
    if (!placed.current) {
      void t.offsetWidth;
      t.style.transition = '';
      placed.current = true;
    }
  }, [selected]);
  return (
    <div class="skala-knappar" ref={track} style={{ '--n': String(values.length) }}>
      <span class="skala-tommel" ref={thumb} aria-hidden="true" />
      {values.map((n) => (
        <button type="button" role="radio" aria-checked={selected === n} onClick={() => onPick(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}
