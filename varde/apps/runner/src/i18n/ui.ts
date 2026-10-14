import type { LocalizedText, Lang } from '@varde/schema/template/texts';
import nn from './ui.nn.json';
import en from './ui.en.json';
import nb from './ui.nb.json';

export type UiKey = keyof typeof nn;
export function ui(lang: Lang, key: UiKey, n?: number): string {
  const strings: Partial<Record<UiKey, string>> = lang === 'en' ? en : lang === 'nb' ? nb : nn;
  return (strings[key] ?? nn[key]).replace('{n}', String(n ?? ''));
}
export function text(value: LocalizedText | undefined, lang: Lang): string {
  return value?.[lang] ?? value?.nn ?? '';
}
export function defaultLanguage(languages: readonly Lang[], client: string): Lang {
  return languages.includes(client as Lang) ? client as Lang : 'nn';
}
