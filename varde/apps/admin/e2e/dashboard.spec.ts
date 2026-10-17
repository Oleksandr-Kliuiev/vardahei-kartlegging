import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { login, openRound, state } from './support.js';

async function dashboard(page: Page) {
  await login(page);
  const s = await state(page),
    f = s.rounds.dashboard!,
    other = s.rounds.dashboard_extra!;
  const progress = await page.request.get(`/api/admin/rounds/${f.id}/progress`);
  const counts = (await progress.json()) as {
    clients: { round_client_id: string; responses_total: number }[];
  };
  for (const [fixture, n] of [
    [f, 6],
    [other, 3],
  ] as const) {
    const have = counts.clients.find((c) => c.round_client_id === fixture.rc)?.responses_total ?? 0;
    for (let i = have; i < n; i++) {
      const role = fixture === f && i < 3 ? 'kontor' : 'sal';
      const response = await page.request.post('/api/runner/submissions', {
        headers: { authorization: `Bearer ${fixture.code}` },
        data: {
          submission_id: randomUUID(),
          part: 'common',
          lang: 'nn',
          answers: {
            F1: `ZZTEST${String.fromCharCode(65 + i)}`,
            F2: role,
            F8: role === 'kontor' ? 'ja' : 'nei',
            F12: 'ja',
            F5: 'nei',
            F14: 'nei',
          },
          duration_s: 120,
        },
      });
      expect(response.status()).toBe(201);
    }
  }
  await openRound(page, f.name, 'Resultat');
  await expect(page.locator('.hero').getByText('9 svar', { exact: true })).toBeVisible();
  return s;
}
test.describe('dashboard (1.27–1.29)', () => {
  test('the old address opens «Resultat» of the newest round that has answers', async ({
    page,
  }) => {
    await login(page);
    const rounds = (await (await page.request.get('/api/admin/rounds')).json()) as {
      id: string;
      has_data: boolean;
    }[];
    const expected = rounds.find((r) => r.has_data);
    expect(expected).toBeDefined();
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(new RegExp(`/admin/rounds/${expected!.id}/resultat$`));
    await expect(
      page.getByRole('navigation', { name: 'Runden' }).getByRole('link', { name: 'Resultat' }),
    ).toHaveAttribute('aria-current', 'page');
  });
  test('legacy section order, eight accessible rings and audited employee rows', async ({
    page,
  }) => {
    const rows: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/admin/rows/per-employee')) rows.push(r.url());
    });
    const s = await dashboard(page);
    await expect(
      page.getByRole('heading', { name: 'Samanlikning med runde 1', exact: true }),
    ).toBeVisible();
    // The summary comes first; rows per employee are read (and logged) only when opened (2.17).
    await expect(page.locator('main section.fold details[open]')).toHaveCount(4);
    expect(rows).toEqual([]);
    await page.locator('summary').filter({ hasText: 'Svar per tilsett' }).click();
    await expect(page.locator('table.tilsette tbody tr')).toHaveCount(9);
    expect(rows.length).toBeGreaterThan(0);
    const headings = await page
      .locator('main section.fold > details > summary > h2')
      .allTextContents();
    expect(headings).toEqual([
      'Soner',
      'Dette bør vi ta tak i',
      'Nøkkelspørsmåla',
      'Samanlikning med runde 1',
      'Svar per tilsett',
      'Svar frå alle tilsette',
      'Sitat frå tilsette',
      'Leiarane',
    ]);
    await expect(page.locator('.kaker svg[role="img"]')).toHaveCount(8);
    // Blocks fold, the choice survives a reload, «Opne alle» opens them again.
    await page.getByRole('button', { name: 'Fold alle' }).click();
    await expect(page.locator('main section.fold details[open]')).toHaveCount(0);
    await expect(page.locator('table.tilsette')).toBeHidden();
    await page.reload();
    // The round is in the address, so a reload stays on it.
    await expect(page.locator('main section.fold')).toHaveCount(8);
    await expect(page.locator('main section.fold details[open]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Opne alle' }).click();
    await expect(page.locator('main section.fold details[open]')).toHaveCount(8);
    await expect(page.locator('table.tilsette tbody tr')).toHaveCount(9);
    const audit = await page.request.get('/api/admin/audit?limit=40');
    expect(await audit.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          what: 'privacy.rows',
          target: `round:${s.rounds.dashboard!.id}`,
        }),
      ]),
    );
  });
  test('client and role filters change response counts through the real API', async ({ page }) => {
    const s = await dashboard(page);
    await page.getByLabel('Kunde', { exact: true }).selectOption(s.client);
    await expect(page.locator('.hero').getByText('6 svar', { exact: true })).toBeVisible();
    await page.getByLabel('Rolle', { exact: true }).selectOption('kontor');
    await expect(page.locator('.hero').getByText('3 svar', { exact: true })).toBeVisible();
    await expect(page.locator('.rute tbody')).toContainText('Administrasjon');
    await page.getByLabel('Kunde', { exact: true }).selectOption('');
    await expect(page.locator('.hero').getByText('9 svar', { exact: true })).toBeVisible();
  });
  test('leader read is separate and audited; aggregate JSON has no raw identities', async ({
    page,
  }) => {
    const s = await dashboard(page);
    await page.getByLabel('Kunde', { exact: true }).selectOption(s.client);
    await page.locator('summary').filter({ hasText: 'Leiarane' }).click();
    await expect(
      page.getByText('Leiarsvara er ikkje anonyme. Éi rad per leiar som har svart.'),
    ).toBeVisible();
    const audit = await page.request.get('/api/admin/audit?limit=40');
    expect(await audit.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ what: 'leader.read' })]),
    );
    const aggregate = await page.request.get(
      `/api/admin/dashboard?round=${s.rounds.dashboard!.id}`,
    );
    expect(await aggregate.text()).not.toMatch(/answers|respondent_key|submission_id|ZZTEST/);
  });
  test('light and dark screenshots of the dashboard', async ({ page }, info) => {
    await dashboard(page);
    await page.getByRole('button', { name: 'Opne alle' }).click();
    await expect(page.locator('table.tilsette tbody tr')).toHaveCount(9);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.screenshot({ path: info.outputPath(`dashboard-${theme}.png`), fullPage: true });
    }
  });
});
