import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import type { TemplateContent } from '@varde/schema/template/template';
import type { Question } from '@varde/schema/template/question';
import type { RunnerRound } from '../src/round.js';

export function state() {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, '../test-results/rounds.json'), 'utf8')) as Record<'nn' | 'en' | 'closed' | 'anonymous' | 'security', { code: string; version: string; roundClient: string }>;
}
export function syntheticContent(): TemplateContent {
  return (JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../config/seed/templates/ki.2026-10-13.json'), 'utf8')) as { content: TemplateContent }).content;
}
export const words = (nn: string, en = nn) => ({ nn, en });
const option = (id: string) => ({ id, texts: { text: words(id) } });
export function rendererQuestions(): Question[] {
  return [
    { id: 'Q1', type: 'single', part: 'common', texts: { text: words('Vel eitt', 'Choose one') }, options: ['a', 'b'].map(option) },
    { id: 'Q2', type: 'multi', part: 'common', texts: { text: words('Vel fleire') }, options: ['a', 'b', 'c', 'ingen', 'anna'].map(option), max_choices: 2, exclusive_options: ['ingen'], free_text: { texts: { text: words('Fortel meir') }, when: ['anna'] } },
    { id: 'Q3', type: 'text', part: 'common', texts: { text: words('Skriv to teikn') }, single_line: true, required: true, uppercase: true, max_length: 8 },
    { id: 'Q4', type: 'scale', part: 'common', texts: { text: words('Skala') }, rows: ['a', 'b'].map(option), scale: { min: 1, max: 5, low: words('Låg'), high: words('Høg') }, free_text: { texts: { text: words('Fortel meir') } } },
    { id: 'Q5', type: 'nps', part: 'common', texts: { text: words('Tilråding') }, scale: { min: 0, max: 10, low: words('Lite'), high: words('Mykje') } },
  ];
}
/** Keep the real bearer/status/metadata endpoint; replace only template content for renderer tests. */
export async function rendererSurvey(page: Page) {
  await page.route('**/api/runner/round', async (route) => {
    const response = await route.fetch();
    const round = await response.json() as RunnerRound;
    round.version.content = { ...round.version.content, questions: rendererQuestions(), leader_roles: [] };
    await route.fulfill({ response, json: round });
  });
  await page.goto(`/r?c=${state().nn.code}`);
  await page.locator('#start').click();
  await expect(page.locator('#sp-Q1')).toBeVisible();
}
export async function toMulti(page: Page) { await rendererSurvey(page); await page.locator('.opt[data-id="a"]').click(); await expect(page.locator('#sp-Q2')).toBeVisible(); }
export async function toText(page: Page) { await toMulti(page); await page.locator('.opt[data-id="a"]').click(); await page.locator('#vidare').click(); }
export async function toScale(page: Page) { await toText(page); await page.locator('#tekst-Q3').fill('xy'); await page.locator('#vidare').click(); }
