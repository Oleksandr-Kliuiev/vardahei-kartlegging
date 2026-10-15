// 2.5: the FindingRule editor through the real API. Rule versions stay in the database between local
// runs, so the test reads the current version and the current answers before it changes them.
import { expect, test, type Page } from '@playwright/test';
import { login, state } from './support.js';

async function openF8(page: Page) {
  await login(page);
  const s = await state(page);
  await page.getByRole('link', { name: 'Funn', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Funn', exact: true })).toBeVisible();
  await expect(page.locator('.regel-rad')).toHaveCount(15);
  const row = page
    .locator('.regel-rad')
    .filter({ has: page.locator('.kjeldebrikke', { hasText: /^F8$/ }) });
  await row.click();
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#funn-tittel')).toContainText('F8');
  await page
    .getByRole('combobox', { name: 'Runde', exact: true })
    .selectOption({ label: `${s.mark}-baseline` });
  return s;
}
const line = (page: Page, name: RegExp) => page.locator('.utfall').filter({ hasText: name });

test('Funn: an edit updates the live preview and saving shows the next version', async ({
  page,
}) => {
  await openF8(page);
  const round = await page.getByRole('combobox', { name: 'Runde', exact: true }).inputValue();
  const chip = page.locator('#funn-redigering .merkelappar .chip').first();
  await expect(chip).toHaveText(/^Versjon \d+$/);
  const version = Number((await chip.textContent())!.replace(/\D/g, ''));
  // Six synthetic answers in the closed baseline round, all «Nei» on F8.
  await expect(line(page, /^Versjon/)).toContainText(/av 6/);
  const nei = page.getByRole('checkbox', { name: 'Nei', exact: true });
  const counted = await nei.isChecked();
  await nei.setChecked(!counted);
  await expect(page.locator('#funn-redigering .chip.warn')).toHaveText('Ikkje lagra');
  await expect(line(page, /^Med endringa/)).toContainText(
    counted ? '0 av 6 (0 %)' : '6 av 6 (100 %)',
  );
  await expect(line(page, /^Med endringa/)).toContainText(counted ? 'Ikkje funn' : 'Høg');
  await expect(line(page, /^Versjon/)).toContainText(counted ? '6 av 6' : '0 av 6');
  // A threshold change is previewed too, without saving.
  await page.getByRole('spinbutton', { name: 'Høg frå', exact: true }).fill('100');
  await expect(line(page, /^Med endringa/)).toContainText(counted ? 'Ikkje funn' : 'Høg');
  await page.getByRole('spinbutton', { name: 'Høg frå', exact: true }).fill('30');
  await page
    .getByRole('textbox', { name: 'Funnet, nynorsk' })
    .fill(`brukar same passord fleire stader (e2e ${version + 1})`);
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/admin/finding-rules/tryggleik.f8/versions') && r.status() === 201,
  );
  await page.getByRole('button', { name: `Lagre som versjon ${version + 1}`, exact: true }).click();
  await saved;
  await expect(page.getByText(`Lagra som versjon ${version + 1}.`, { exact: true })).toBeVisible();
  await expect(chip).toHaveText(`Versjon ${version + 1}`);
  // The form stays: no unsaved mark, the preview keeps its round and now compares the new version.
  await expect(page.locator('#funn-redigering .chip.warn')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Runde', exact: true })).toHaveValue(round);
  await expect(line(page, /^Versjon/)).toContainText(`Versjon ${version + 1}`);
  await expect(page.locator('.versjonar li').first()).toContainText(`v${version + 1}`);
  await expect(page.locator('.versjonar li').first()).toContainText('svar som tel');
  await expect(page.locator('.regel-rad[aria-current="true"] .chip')).toHaveText(`v${version + 1}`);
  // The closed baseline round still shows what it showed before: the dashboard keeps its release.
  const audit = await page.request.get('/api/admin/audit?limit=40');
  expect(await audit.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        what: 'findings.rule_version',
        target: 'finding_rule:tryggleik.f8',
      }),
    ]),
  );
});

test('Funn at 1280 and 360 px, light and dark: no sideways scroll, keyboard reaches the rules', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openF8(page);
  const roundSelect = page.getByRole('combobox', { name: 'Runde', exact: true });
  const baseline = await roundSelect.inputValue();
  const f8 = page
    .locator('.regel-rad')
    .filter({ has: page.locator('.kjeldebrikke', { hasText: /^F8$/ }) });
  for (const [width, height] of [
    [1280, 900],
    [360, 780],
  ] as const) {
    await page.setViewportSize({ width, height });
    if (width === 360) {
      // Keyboard only: focus a rule and press Enter, then back to F8; the chosen round stays.
      const other = page.locator('.regel-rad').nth(1);
      await other.focus();
      await page.keyboard.press('Enter');
      await expect(other).toHaveAttribute('aria-current', 'true');
      await expect(roundSelect).toHaveValue(baseline);
      await f8.focus();
      await page.keyboard.press('Enter');
      await expect(f8).toHaveAttribute('aria-current', 'true');
      await expect(roundSelect).toHaveValue(baseline);
    }
    await expect(line(page, /^Versjon/)).toContainText('av 6');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    // Full-page shots from the top: the sticky top line otherwise lands mid-page.
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.screenshot({
        path: info.outputPath(`funn-${width}-${colorScheme}.png`),
        fullPage: true,
      });
    }
  }
});

test('Funn: KI groups K7 × K8 answers; leader rules keep their answers and set a level', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.getByRole('link', { name: 'Funn', exact: true }).click();
  const brick = (text: RegExp) =>
    page.locator('.regel-rad').filter({ has: page.locator('.kjeldebrikke', { hasText: text }) });
  await page.getByRole('group', { name: 'Skjema' }).getByRole('button', { name: 'KI' }).click();
  await brick(/^K7 × K8$/).click();
  const aldri = page.getByRole('group', { name: 'K7: Aldri', exact: true });
  await expect(aldri.getByRole('checkbox', { name: 'K8: Av og til', exact: true })).toBeChecked();
  await expect(aldri.getByRole('checkbox', { name: 'K8: Aldri', exact: true })).not.toBeChecked();
  await expect(page.getByText('Ingen rundar med dette skjemaet enno.')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('funn-ki-cross.png'), fullPage: true });
  await page
    .getByRole('group', { name: 'Skjema' })
    .getByRole('button', { name: 'Tryggleik' })
    .click();
  await page.getByRole('group', { name: 'Del' }).getByRole('button', { name: 'Leiar' }).click();
  await expect(page.locator('.regel-rad')).toHaveCount(10);
  await expect(brick(/^F12 × B13$/)).toHaveCount(1);
  await brick(/^B13$/).click();
  await expect(page.locator('.faste-val .chip')).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Nivå', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Høg frå', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('funn-leader.png'), fullPage: true });
});
