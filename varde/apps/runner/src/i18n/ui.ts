import type { LocalizedText, Lang } from '@varde/schema/template/texts';
import nn from './ui.nn.json';
import en from './ui.en.json';
import nb from './ui.nb.json';

export type UiKey = keyof typeof nn;
/** UI string; `{n}` takes a number, other placeholders ({i}, {k}, {a}, {m}) come from `vars`. */
export function ui(lang: Lang, key: UiKey, n?: number | Record<string, string | number>): string {
  const strings: Partial<Record<UiKey, string>> = lang === 'en' ? en : lang === 'nb' ? nb : nn;
  const vars = typeof n === 'object' ? n : { n: n ?? '' };
  return (strings[key] ?? nn[key]).replace(/\{(\w)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all));
}
export function text(value: LocalizedText | undefined, lang: Lang): string {
  return value?.[lang] ?? value?.nn ?? '';
}
export function defaultLanguage(languages: readonly Lang[], client: string): Lang {
  return languages.includes(client as Lang) ? client as Lang : 'nn';
}
