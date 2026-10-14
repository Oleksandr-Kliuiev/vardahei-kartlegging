import nn from './notice-v2.nn.json';
import en from './notice-v2.en.json';
import type { Lang } from '@varde/schema/template/texts';

export function notice(lang: Lang, key: keyof typeof nn): string {
  return (lang === 'en' ? en : nn)[key];
}
