import { useEffect, useState } from 'preact/hooks';
import { optionsFor, type Answers, type AnswerValue } from '@varde/rules/runner';
import type { Question } from '@varde/schema/template/question';
import type { Lang } from '@varde/schema/template/texts';
import { text, ui } from './i18n/ui.js';

export function canContinue(q: Question, value: AnswerValue | undefined): boolean {
  switch (q.type) {
    case 'single': return typeof value === 'string' && value !== '';
    case 'multi': return Array.isArray(value) && value.length >= (q.min_choices ?? 1);
    case 'text': return !q.required || (typeof value === 'string' && value.trim().length >= (q.min_length ?? 2));
    case 'nps': return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10;
    case 'scale': return value !== null && typeof value === 'object' && !Array.isArray(value) && q.rows.every((r) => {
      const n = value[r.id];
      return typeof n === 'number' && Number.isInteger(n) && n >= q.scale.min && n <= q.scale.max;
    });
  }
}

/** Replacing an exclusive choice and selecting one always clear incompatible choices. */
export function toggleChoice(q: Extract<Question, { type: 'multi' }>, picked: string[], id: string): string[] {
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
  onAnswer: (value: AnswerValue) => void;
  onFree: (value: string) => void;
  onAdvance: () => void;
}

export function QuestionRenderer({ question: q, answers, free, lang, onAnswer, onFree, onAdvance }: Props) {
  const value = answers[q.id];
  const [clicked, setClicked] = useState(false);
  // Cleanup on Back, Skip, language change or unmount; no stale timer can skip another question.
  useEffect(() => {
    if (!clicked || q.type !== 'single' || q.free_text !== undefined || !canContinue(q, value)) return;
    const timer = setTimeout(onAdvance, 260);
    return () => clearTimeout(timer);
  }, [q.id, value, clicked]); // onAdvance captures the state corresponding to this answer

  const choices = optionsFor(q, answers);
  const picked = q.type === 'multi' && Array.isArray(value) ? value.filter((v) => choices.some((o) => o.id === v)) : [];
  const freeText = 'free_text' in q ? q.free_text : undefined;
  const freeShown = freeText !== undefined && (freeText.when === undefined ||
    freeText.when.some((id) => Array.isArray(value) ? value.includes(id) : value === id));

  return <div class={`skjerm${'scenario' in q && q.scenario ? ' scenario' : ''}`} data-question-id={q.id}>
    {q.texts.section_title && <div class="ingress">{text(q.texts.section_title, lang)}</div>}
    <h2 class="sp" id={`sp-${q.id}`}>{text(q.texts.text, lang)}</h2>
    {q.texts.help && <p class="hjelp">{text(q.texts.help, lang)}</p>}
    {q.type === 'multi' && q.max_choices && <p class="hjelp">{ui(lang, 'maks', q.max_choices)}</p>}
    {(q.type === 'single' || q.type === 'multi') && <div class="val" role={q.type === 'single' ? 'radiogroup' : 'group'} aria-labelledby={`sp-${q.id}`}>
      {choices.map((o) => {
        const selected = q.type === 'multi' ? picked.includes(o.id) : value === o.id;
        const blocked = q.type === 'multi' && !selected && !q.exclusive_options?.includes(o.id) &&
          !picked.some((id) => q.exclusive_options?.includes(id)) && q.max_choices !== undefined && picked.length >= q.max_choices;
        return <button type="button" class="opt" role={q.type === 'single' ? 'radio' : 'checkbox'} data-id={o.id}
          aria-checked={selected} disabled={blocked} onClick={() => {
            onAnswer(q.type === 'single' ? o.id : toggleChoice(q, picked, o.id));
            setClicked(true);
          }}>
          <span class="ind" aria-hidden="true" /><span>{text(o.texts.text, lang)}</span>
        </button>;
      })}
    </div>}
    {q.type === 'text' && (q.single_line ? <input type="text" id={`tekst-${q.id}`} autoComplete="off"
      class={q.uppercase ? 'stor' : ''} aria-labelledby={`sp-${q.id}`} placeholder={text(q.texts.placeholder, lang)}
      maxLength={q.max_length ?? 80} value={typeof value === 'string' ? value : ''}
      onInput={(e) => {
        const field = e.currentTarget;
        const position = field.selectionStart;
        const next = (q.uppercase ? field.value.toUpperCase() : field.value).slice(0, q.max_length ?? 80);
        field.value = next;
        if (position !== null) field.setSelectionRange(position, position);
        onAnswer(next);
      }} /> : <textarea id={`tekst-${q.id}`} aria-labelledby={`sp-${q.id}`} maxLength={q.max_length ?? 1500}
      placeholder={text(q.texts.placeholder, lang)} value={typeof value === 'string' ? value : ''}
      onInput={(e) => onAnswer((q.uppercase ? e.currentTarget.value.toUpperCase() : e.currentTarget.value).slice(0, q.max_length ?? 1500))} />)}
    {(q.type === 'scale' || q.type === 'nps') && <div class={`skala${q.type === 'nps' ? ' nps' : ''}`}>
      {(q.type === 'scale' ? q.rows : [{ id: 'nps', texts: { text: q.texts.text } }]).map((r) => {
        const selected = q.type === 'nps' ? value : typeof value === 'object' && value !== null && !Array.isArray(value) ? value[r.id] : undefined;
        return <div class="skala-rad" role="radiogroup" aria-label={text(r.texts.text, lang)} data-row={r.id}>
          {q.type === 'scale' && <div class="namn">{text(r.texts.text, lang)}</div>}
          <div class="skala-knappar">{Array.from({ length: q.scale.max - q.scale.min + 1 }, (_, i) => i + q.scale.min).map((n) =>
            <button type="button" role="radio" aria-checked={selected === n} onClick={() => {
              const rows = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
              onAnswer(q.type === 'nps' ? n : { ...rows, [r.id]: n });
            }}>{n}</button>,
          )}</div>
          <div class="skala-endar"><span>{text(q.scale.low, lang)}</span><span>{text(q.scale.high, lang)}</span></div>
        </div>;
      })}
    </div>}
    {freeText && <div class="fri" hidden={!freeShown}>
      <label for={`fri-${q.id}`}>{text(freeText.texts.text, lang)}</label>
      <textarea id={`fri-${q.id}`} maxLength={800} value={free[q.id] ?? ''} onInput={(e) => onFree(e.currentTarget.value.slice(0, 800))} />
    </div>}
  </div>;
}
