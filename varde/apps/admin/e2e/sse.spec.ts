import { expect, test } from '@playwright/test';
import { login, menu, state, selectProgress, submit } from './support.js';

test('second tab refetches changed progress within two seconds', async ({ page, context }) => {
  await login(page);
  const fixture = await selectProgress(page, 'sse');
  const second = await context.newPage();
  await second.goto('/admin');
  await selectProgress(second, 'sse');
  const before = await second.request.get(`/api/admin/rounds/${fixture.id}/progress`);
  const body = (await before.json()) as { clients: { responses_total: number }[] };
  await submit(page, fixture.code);
  await expect(second.locator('tbody')).toContainText(
    `${body.clients[0]!.responses_total + 1} svar`,
    { timeout: 2000 },
  );
  await second.close();
});
test('API restart reconnects; one connection per tab and one refetch per event', async ({
  page,
  context,
}) => {
  await login(page);
  const fixture = await selectProgress(page, 'sse');
  const second = await context.newPage();
  await second.goto('/admin');
  await selectProgress(second, 'sse');
  await expect.poll(async () => (await state(page)).connections).toBe(2);
  await expect(second.locator('tbody tr')).toHaveCount(1);
  const refetched = second.waitForResponse(
    (r) => r.url().includes(`/api/admin/rounds/${fixture.id}/progress`) && r.status() === 200,
  );
  const restart = await fetch('http://127.0.0.1:3101/restart', { method: 'POST' });
  expect(restart.status).toBe(204);
  await refetched;
  await expect.poll(async () => (await state(page)).connections).toBe(2);
  await expect(second.getByRole('status').filter({ hasText: 'Oppdatert i sanntid' })).toBeVisible();
  // Settle the reconnect refetch before measuring the next mutation.
  await expect
    .poll(async () =>
      (await second.request.get(`/api/admin/rounds/${fixture.id}/progress`)).status(),
    )
    .toBe(200);
  const calls: string[] = [];
  second.on('request', (r) => {
    if (r.url().includes(`/api/admin/rounds/${fixture.id}/progress`)) calls.push(r.url());
  });
  const before = await second.request.get(`/api/admin/rounds/${fixture.id}/progress`);
  const body = (await before.json()) as { clients: { responses_total: number }[] };
  await submit(page, fixture.code);
  await expect(second.locator('tbody')).toContainText(
    `${body.clients[0]!.responses_total + 1} svar`,
    { timeout: 2000 },
  );
  expect(calls).toHaveLength(1);
  await menu(second, 'Rundar');
  await expect.poll(async () => (await state(page)).connections).toBe(2);
  await second.close();
  await expect.poll(async () => (await state(page)).connections).toBe(1);
});
test('events require session; navigation and reload preserve one listener', async ({ page }) => {
  expect((await page.request.get('/api/admin/events')).status()).toBe(401);
  await login(page);
  await menu(page, 'Rundar');
  await expect.poll(async () => (await state(page)).connections).toBe(1);
  await page.reload();
  await expect.poll(async () => (await state(page)).connections).toBe(1);
});
