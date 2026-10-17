// Shared pieces of the survey workshop (2.15): a text field that edits one language at a time and shows
// the Nynorsk source beside a translation, the issue list item, and language names.
import { useId } from 'react';
import { Icon } from './icons.js';
import { schemaMessage } from './schema-message.js';
import type { Lang, Text } from './verkstad-model.js';

export const LANG_NAME: Record<Lang, string> = { nn: 'Nynorsk', en: 'English', nb: 'Bokmål' };
const IN_LANG: Record<Lang, string> = { nn: 'nynorsk', en: 'engelsk', nb: 'bokmål' };
const MISSING: Record<Lang, string> = {
  nn: 'Manglar tekst',
  en: 'Manglar på engelsk',
  nb: 'Manglar på bokmål',
};

export interface Issue {
  path: (string | number)[];
  message: string;
  /** The draft cannot be saved with it (a broken reference, an empty required field). */
  blocking: boolean;
}
export const issueText = (i: Issue) => schemaMessage(i.message);

/** One text in the language being edited; a translation shows its Nynorsk source above the field. */
export function TekstFelt({
  label,
  text,
  lang,
  onChange,
  multiline = false,
  readOnly = false,
  placeholder,
  big = false,
  hideLabel = false,
}: {
  label: string;
  text: Text | undefined;
  lang: Lang;
  onChange: (next: Text) => void;
  multiline?: boolean;
  readOnly?: boolean;
  placeholder?: string | undefined;
  /** The question text: set like the heading the respondent sees. */
  big?: boolean;
  /** In a numbered list the number shows the place; the label is for screen readers. */
  hideLabel?: boolean;
}) {
  const id = useId();
  const value = text?.[lang] ?? '';
  const source = lang !== 'nn' ? (text?.nn ?? '') : '';
  const missing = lang !== 'nn' && source.trim() !== '' && value.trim() === '';
  const set = (v: string) => onChange({ ...(text ?? { nn: '' }), [lang]: v });
  const common = {
    id,
    value,
    readOnly,
    placeholder: placeholder ?? (lang === 'nn' ? undefined : source),
    'aria-describedby': source ? `${id}-kjelde` : undefined,
    onChange: (e: { target: { value: string } }) => set(e.target.value),
  };
  return (
    <div className="vk-felt">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
        {lang !== 'nn' && <span className="vk-sprak">{LANG_NAME[lang]}</span>}
      </label>
      {source && (
        <p className="vk-kjelde" id={`${id}-kjelde`}>
          <b>Nynorsk</b> {source}
        </p>
      )}
      {multiline || big ? (
        <textarea className={big ? 'vk-stor input' : 'input'} rows={big ? 2 : 3} {...common} />
      ) : (
        <input className="input" {...common} />
      )}
      {missing && (
        <small className="vk-manglar">
          <Icon name="varsel" small />
          {MISSING[lang]}
        </small>
      )}
    </div>
  );
}

/** The other languages of a Nynorsk text: done, or missing with a way to write it. */
export function AndreSprak({
  text,
  languages,
  onLang,
}: {
  text: Text | undefined;
  languages: readonly Lang[];
  onLang: (lang: Lang) => void;
}) {
  if (!text?.nn.trim()) return null;
  const others = languages.filter((l) => l !== 'nn');
  if (!others.length) return null;
  return (
    <div className="vk-andre">
      {others.map((l) =>
        text[l]?.trim() ? (
          <span key={l} className="vk-ok">
            <Icon name="hake" small />
            {LANG_NAME[l]}: <span className="vk-andre-tekst">{text[l]}</span>
          </span>
        ) : (
          <span key={l} className="vk-manglar">
            <Icon name="varsel" small />
            {MISSING[l]}
            <button type="button" className="linkbtn" onClick={() => onLang(l)}>
              Skriv på {IN_LANG[l]}
            </button>
          </span>
        ),
      )}
    </div>
  );
}
