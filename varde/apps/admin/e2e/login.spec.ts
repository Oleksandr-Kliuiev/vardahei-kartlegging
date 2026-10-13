// Task 0.7b: login of a member, 403 for a non-member, logout → protected route 401 (mock Entra).
import { expect, type Page, test } from '@playwright/test';
import { ADMIN_GROUP, API_PORT } from './global-setup.js';

const BASE = `http://127.0.0.1:${API_PORT}`;

async function scenario(groups: string[]): Promise<void> {
  const res = await fetch(`${process.env.MOCK_OIDC_ORIGIN}/__scenario`, {
    method: 'POST',
    body: JSON.stringify({ groups }),
  });
  expect(res.status).toBe(204);
}

async function login(page: Page): Promise<void> {
  await scenario(['other-group', ADMIN_GROUP]);
  await page.goto('/auth/login');
  await expect(page).toHaveURL(`${BASE}/`);
}

test('a member logs in and gets a session', async ({ page }) => {
  await login(page);
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === 'varde_session');
  expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
  const me = await page.request.get('/auth/me');
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ via: 'entra', name: 'Test Admin' });
});

test('a non-member gets 403 with the Nynorsk text', async ({ page }) => {
  await scenario(['other-group']);
  const response = await page.goto('/auth/login');
  expect(response?.status()).toBe(403);
  await expect(page.locator('body')).toContainText('Du har ikkje tilgang til Varde.');
  expect((await page.request.get('/auth/me')).status()).toBe(401);
});

test('after logout the protected route answers 401', async ({ page }) => {
  await login(page);
  expect((await page.request.get('/auth/me')).status()).toBe(200);
  const out = await page.request.post('/auth/logout', { maxRedirects: 0 });
  expect(out.status()).toBe(302);
  expect((await page.request.get('/auth/me')).status()).toBe(401);
});
