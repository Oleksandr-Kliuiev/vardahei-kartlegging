import { randomBytes, randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { editorFixture } from '../test/editor-fixture.js';
import { ADMIN_GROUP } from './global-setup.js';

export interface Fixture {
  id: string;
  rc: string;
  name: string;
  code: string;
}
export interface State {
  mark: string;
  client: string;
  other_client: string;
  version: string;
  rounds: Record<string, Fixture>;
  /** A published version for live questions (3b). */
  live_version: string;
  connections: number;
}

export async function scenario(groups = [ADMIN_GROUP]) {
  const response = await fetch(`${process.env.MOCK_OIDC_ORIGIN}/__scenario`, {
    method: 'POST',
    body: JSON.stringify({ groups }),
  });
  expect(response.status).toBe(204);
}
export async function login(page: Page) {
  await scenario();
  await page.goto('/auth/login');
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  await page.getByRole('link', { name: 'Opne adminpanelet' }).click();
  await expect(page.getByRole('heading', { name: 'I dag', exact: true })).toBeVisible();
}
/** A place in the main menu (2.17: I dag · Skjema · Rundar · Kundar · Seminar · Personvern · Innstillingar). */
export async function menu(page: Page, label: string) {
  await page
    .getByRole('navigation', { name: 'Hovudmeny' })
    .getByRole('link', { name: label, exact: true })
    .click();
}
/** The page of one round, opened from «Rundar» (2.17); `tab` is one of its four views. */
export async function openRound(page: Page, name: string, tab?: string) {
  await menu(page, 'Rundar');
  const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  await page
    .locator('a.rad-lenkje')
    .filter({ has: page.locator('.rad-hovud b', { hasText: exact }) })
    .click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  if (tab)
    await page
      .getByRole('navigation', { name: 'Runden' })
      .getByRole('link', { name: tab, exact: true })
      .click();
}
/** A view of «Personvern» (Eksport, Sletting, Kontaktar, Logg). */
export async function personvern(page: Page, tab: string) {
  await menu(page, 'Personvern');
  await page
    .getByRole('navigation', { name: 'Personvern' })
    .getByRole('link', { name: tab, exact: true })
    .click();
}
export async function state(page: Page): Promise<State> {
  return (await (await page.request.get('/__e2e/state')).json()) as State;
}
export async function progress(page: Page, code: string, question_no: number) {
  const response = await page.request.post('/api/runner/progress', {
    headers: { authorization: `Bearer ${code}` },
    data: { session_id: randomBytes(12).toString('hex'), question_no },
  });
  expect(response.status()).toBe(204);
}
export async function submit(page: Page, code: string, duration_s = 120) {
  const response = await page.request.post('/api/runner/submissions', {
    headers: { authorization: `Bearer ${code}` },
    data: {
      submission_id: randomUUID(),
      part: 'common',
      lang: 'nn',
      answers: { F1: 'ZZTEST', F2: 'kontor', F12: 'ja' },
      duration_s,
    },
  });
  expect(response.status()).toBe(201);
}
export async function selectProgress(page: Page, label: string) {
  const f = (await state(page)).rounds[label]!;
  await openRound(page, f.name, 'Framdrift');
  await expect(page.getByRole('heading', { name: `Framdrift i ${f.name}` })).toBeVisible();
  return f;
}

/** A synthetic survey made with «Nytt skjema», filled through the API and opened in the workshop (2.15). */
export async function newSurvey(page: Page, questions?: TemplateContent['questions']) {
  await login(page);
  await menu(page, 'Skjema');
  await page.getByRole('button', { name: 'Nytt skjema', exact: true }).click();
  await page.getByLabel('Utan namn', { exact: true }).check();
  await page.getByLabel('Namn på skjemaet', { exact: true }).fill(`E2E ${randomUUID()}`);
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/admin/surveys') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Lag skjemaet', exact: true }).click();
  const v = (await (await created).json()) as {
    id: string;
    template_id: string;
    content_hash: string;
    content: TemplateContent;
  };
  await expect(page).toHaveURL(new RegExp(`/admin/surveys/${v.id}$`));
  const key = v.content.key;
  const content = editorFixture().content;
  content.key = key;
  if (questions) content.questions = questions;
  const saved = await page.request.put(`/api/admin/surveys/versions/${v.id}`, {
    data: { content_hash: v.content_hash, content },
  });
  expect(saved.status()).toBe(200);
  await page.reload();
  await expect(page.locator('.vk-sti')).toBeVisible();
  return { ...v, key, content, content_hash: ((await saved.json()) as Saved).content_hash };
}
interface Saved {
  content_hash: string;
}
/** Accepts every required language of a saved version and publishes it, as the API allows. */
export async function publish(page: Page, id: string, frozen_changes: Record<string, string> = {}) {
  const v = (await (
    await page.request.get(`/api/admin/surveys/versions/${id}`)
  ).json()) as Saved & {
    required_languages: string[];
  };
  for (const lang of v.required_languages) {
    const r = await page.request.post(`/api/admin/surveys/versions/${id}/accept`, {
      data: { content_hash: v.content_hash, lang },
    });
    expect(r.status()).toBe(201);
  }
  return page.request.post(`/api/admin/surveys/versions/${id}/publish`, {
    data: { content_hash: v.content_hash, confirmed: true, frozen_changes },
  });
}
