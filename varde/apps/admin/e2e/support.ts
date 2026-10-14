import { randomBytes, randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
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
  await expect(page.getByRole('heading', { name: 'Oversikt', exact: true })).toBeVisible();
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
  await page.getByRole('link', { name: 'Oversikt', exact: true }).click();
  await page.getByLabel('Runde', { exact: true }).selectOption(f.id);
  await expect(page.getByRole('heading', { name: `Framdrift i ${f.name}` })).toBeVisible();
  return f;
}
