// Client report (5.1): from the round card to the A4 preview; the human check gates the PDF;
// print media shows only the sheet (no menu, buttons or preview notice); page.pdf() works.
// The fixture round (e2e/server.cjs «report») has synthetic initials, leader answers with a free
// text and a role group below k: none of it may reach the page.
import { expect, test, type Page } from '@playwright/test';
import { login, state } from './support.js';

const SECRETS = ['ZZRAP', 'ZZTEST', 'ZZLEIARTEKST', 'respondent_key', 'leaders_all'];

async function noSecrets(page: Page) {
  const text = await page.locator('main').innerText();
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

test.describe('client report (5.1)', () => {
  test('round card → A4 preview; check before PDF; print shows only the sheet; PDF bytes', async ({
    page,
  }, info) => {
    await login(page);
    const f = (await state(page)).rounds.report!;
    await page.getByRole('link', { name: 'Kundar og rundar', exact: true }).click();
    await page.getByRole('region', { name: f.name }).locator('summary').click(); // finished rounds are folded
    const card = page
      .getByRole('region', { name: f.name })
      .getByRole('article', { name: 'Syntetisk admin kunde' });
    await card.getByRole('link', { name: 'Rapport til kunden' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/reports/${f.rc}$`));
    await expect(page.getByRole('heading', { name: 'Rapport til kunden', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rapportar', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const sheet = page.locator('.rapport-ark');
    await expect(sheet.getByRole('heading', { name: 'Syntetisk admin kunde' })).toBeVisible();
    await expect(sheet).toContainText('IT-tryggleik hos');
    await expect(sheet).toContainText(
      /Laga \d{1,2}\. (januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember) 20\d\d/,
    );
    await expect(sheet).toContainText('Dette bør de ta tak i');
    await expect(sheet).toContainText('Samanlikna med');
    await expect(sheet).toContainText('Kva vi føreslår');
    // Contact as on the finish screen of the survey (decision of Oleksandr 16.10).
    await expect(sheet).toContainText('Vardahei IT · +47 930 94 567 · post@vardahei.no');
    await expect(page.locator('.sjekk')).toContainText('Sone for bedrifta og kritisk andel');
    await noSecrets(page);

    const save = page.getByRole('button', { name: 'Lagre som PDF' });
    await expect(save).toBeDisabled();
    await page.getByText('Eg har lese gjennom rapporten').click();
    await expect(save).toBeEnabled();

    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.waitForTimeout(600); // the theme fades in (--t-base)
      await page.screenshot({ path: info.outputPath(`rapport-${theme}.png`), fullPage: true });
    }
    // Printing in dark theme still gives a light sheet and nothing but the sheet.
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByText('Førehandsvising', { exact: true })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Rapport til kunden', level: 1 })).toBeHidden();
    await expect(sheet).toBeVisible();
    const background = await page
      .locator('.rapport-side')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe('rgb(255, 255, 255)');
    const pdf = await page.pdf({ format: 'A4', path: info.outputPath('rapport.pdf') });
    expect(pdf.byteLength).toBeGreaterThan(1000);
    await page.emulateMedia({ media: 'screen', colorScheme: 'light' });

    const audit = (await (await page.request.get('/api/admin/audit?limit=40')).json()) as {
      what: string;
      target: string;
    }[];
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ what: 'report.client', target: `round_client:${f.rc}` }),
      ]),
    );
  });

  test('«Rapportar» in the menu: choose round and client; English resets the check', async ({
    page,
  }, info) => {
    await login(page);
    const f = (await state(page)).rounds.report!;
    await page.getByRole('link', { name: 'Rapportar', exact: true }).click();
    await expect(page.getByText('Vel ein kunde for å sjå rapporten.')).toBeVisible();
    await page.getByLabel('Runde', { exact: true }).selectOption(f.id);
    await page.getByLabel('Kunde', { exact: true }).selectOption(f.rc);
    const sheet = page.locator('.rapport-ark');
    await expect(sheet).toContainText('IT-tryggleik hos');
    await page.getByText('Eg har lese gjennom rapporten').click();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(sheet).toContainText('IT security at');
    await expect(sheet).toContainText('What you should address');
    await expect(page.getByRole('button', { name: 'Lagre som PDF' })).toBeDisabled();
    await noSecrets(page);
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'A4', path: info.outputPath('rapport-en.pdf') });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
