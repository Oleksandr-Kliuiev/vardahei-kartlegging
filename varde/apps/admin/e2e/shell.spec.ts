import { expect, test } from '@playwright/test';
import { login, scenario } from './support.js';

test('member login → shell with the name from /auth/me', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Test Admin', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Vardahei IT' })).toBeVisible();
});
test('non-member → 403 and no protected API access', async ({ page }) => {
  await scenario(['other-group']);
  expect((await page.goto('/auth/login'))?.status()).toBe(403);
  await expect(page.locator('body')).toContainText('Du har ikkje tilgang');
  expect((await page.request.get('/api/admin/rounds')).status()).toBe(401);
});
test('ten History API sections in menu order, back navigation and direct reload', async ({
  page,
}) => {
  await login(page);
  expect(
    await page.getByRole('navigation', { name: 'Hovudmeny' }).locator('a').allTextContents(),
  ).toEqual([
    'Oversikt',
    'Kundar og rundar',
    'Dashbord',
    'Skjema',
    'Funn',
    'Seminar',
    'Rapportar',
    'Eksport',
    'Sletting',
    'Innstillingar',
  ]);
  for (const label of [
    'Kundar og rundar',
    'Skjema',
    'Funn',
    'Seminar',
    'Rapportar',
    'Dashbord',
    'Eksport',
    'Sletting',
    'Oversikt',
  ]) {
    await page.getByRole('link', { name: label, exact: true }).click();
    // «Rapportar» opens the page «Rapport til kunden» (Vardestien).
    const heading = label === 'Rapportar' ? 'Rapport til kunden' : label;
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Sletting', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sletting', exact: true })).toBeVisible();
});
test('Logg ut revokes the server session → API 401', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Logg ut' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  expect((await page.request.get('/auth/me')).status()).toBe(401);
  expect((await page.request.get('/api/admin/rounds')).status()).toBe(401);
});
test('CSP and assets are local; light/dark shell screenshots', async ({ page }, info) => {
  await login(page);
  const response = await page.request.get('/admin');
  const csp = response.headers()['content-security-policy']!;
  for (const policy of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ])
    expect(csp).toContain(policy);
  expect(csp).not.toMatch(/https?:|unsafe-inline|unsafe-eval/);
  const external: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).origin !== 'http://127.0.0.1:3100') external.push(r.url());
  });
  await page.reload();
  await expect(page.getByText('Test Admin', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  expect(
    await page.evaluate(() => document.fonts.check('15px "Atkinson Hyperlegible Next Variable"')),
  ).toBe(true);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await info.attach(`shell-${colorScheme}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
  expect(external).toEqual([]);
});
test('403 from an API uses the Nynorsk denial view', async ({ page }) => {
  await login(page);
  await page.route('**/auth/me', (route) =>
    route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"denied"}' }),
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Du har ikkje tilgang', exact: true }),
  ).toBeVisible();
});
