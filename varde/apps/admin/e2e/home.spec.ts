// Placeholder home page (decision of 13.10): GET / without a session offers the Microsoft login;
// after login (mock Entra) the same page shows the name and the logout button.
import { expect, test } from '@playwright/test';
import { ADMIN_GROUP } from './global-setup.js';

test('home: login link without a session, name and logout after login', async ({ page }) => {
  const res = await fetch(`${process.env.MOCK_OIDC_ORIGIN}/__scenario`, {
    method: 'POST',
    body: JSON.stringify({ groups: [ADMIN_GROUP] }),
  });
  expect(res.status).toBe(204);
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:3100/') && !r.url().startsWith('data:')) {
      external.push(r.url());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Varde' })).toBeVisible();
  await expect(page.getByText('Under arbeid')).toBeVisible();
  // The inline style passes the CSP hash: the kartlegging background is applied.
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(238, 242, 244)');
  const login = page.getByRole('link', { name: 'Logg inn med Microsoft' });
  await expect(login).toHaveAttribute('href', '/auth/login');
  expect(external).toEqual([]);

  await login.click();
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  await expect(page.getByText('Du er logga inn som Test Admin.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Logg ut' })).toBeVisible();
});
