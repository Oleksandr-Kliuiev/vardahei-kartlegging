// Seminar page `/s?c=<code>` (3a) in a real browser: 360 and 1280 px, light and dark, nynorsk
// and English, no sideways scroll; consent in two boxes, the optional one not ticked (decision
// 16.10); registration ends on «Du er påmeld» with a calendar file that parses; the held seminar
// shows its material; no request leaves the site.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { state } from './support.js';

/** Only same-origin requests (strict CSP, no outside fonts or services). */
function sameOrigin(page: Page) {
  const outside: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol !== 'blob:' && url.protocol !== 'data:')
      outside.push(r.url());
  });
  return outside;
}
const noSideways = async (page: Page, width: number) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

const BOXES = {
  nn: [
    'Eg samtykkjer i at Vardahei IT lagrar namnet, bedrifta og e-postadressa mi for denne påmeldinga.',
    'Eg vil gjerne få invitasjon til seinare seminar frå Vardahei IT. (valfritt)',
  ],
  en: [
    'I agree that Vardahei IT stores my name, company and email address for this registration.',
    'I would like to receive invitations to later seminars from Vardahei IT. (optional)',
  ],
} as const;
/** The two boxes in the language of the page: both there, neither ticked. */
async function twoBoxes(page: Page, lang: 'nn' | 'en') {
  const [required, optional] = BOXES[lang];
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await expect(page.getByRole('checkbox', { name: required, exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: optional, exact: true })).not.toBeChecked();
}
/** The body of the registration the page sends. */
const sent = (page: Page) =>
  page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/public/seminar/registrations'));

test('360 and 1280 px, light and dark, nynorsk and English: whole page, no sideways scroll', async ({ page }, info) => {
  const outside = sameOrigin(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/s?c=${state().seminar_open.code}`);
  await expect(page.locator('h1')).toHaveText('Passord og MFA i kvardagen');
  await expect(page.getByText('torsdag 5. november 2099, kl. 09.00–11.30')).toBeVisible();
  await expect(page.getByText('For Syntetisk Daco og Syntetisk Gasta')).toBeVisible();
  for (const [width, height] of [
    [360, 780],
    [1280, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const lang of ['nn', 'en'] as const) {
      await page.locator(`#sprak-${lang}`).click();
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('h1')).toHaveText(lang === 'en' ? 'Passwords and MFA at work' : 'Passord og MFA i kvardagen');
      await twoBoxes(page, lang);
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await noSideways(page, width);
        await page.screenshot({ path: info.outputPath(`seminar-${width}-${lang}-${colorScheme}.png`), fullPage: true });
      }
    }
  }
  // For the evidence of 3a: nynorsk on a phone in light mode, English on a laptop in dark mode.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.locator('#sprak-nn').click();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.screenshot({ path: info.outputPath('pamelding-360-nn-light.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#sprak-en').click();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.screenshot({ path: info.outputPath('pamelding-1280-en-dark.png'), fullPage: true });
  expect(outside).toEqual([]);
});

test('registration: the form checks first, then «Du er påmeld» and a calendar file that parses', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/s?c=${state().seminar_open.code}`);
  await page.getByRole('button', { name: 'Meld meg på' }).click();
  await expect(page.getByText('Skriv namnet ditt.')).toBeVisible();
  await expect(page.locator('#sem-namn')).toBeFocused();
  await page.locator('#sem-namn').fill('ZZ E2E Deltakar');
  await page.getByLabel('Syntetisk Gasta').check();
  await page.locator('#sem-epost').fill(`zz-e2e-${Date.now()}@example.test`);
  // Without the required box the page says what to tick and sends nothing.
  await twoBoxes(page, 'nn');
  await page.getByRole('button', { name: 'Meld meg på' }).click();
  await expect(
    page.getByText('Kryss av for at vi kan lagre opplysningane for påmeldinga, så kan du melde deg på.'),
  ).toBeVisible();
  await expect(page.locator('#sem-samtykke')).toBeFocused();
  await page.locator('#sem-samtykke').check();
  await page.getByRole('button', { name: 'Les meir om korleis vi handsamar opplysningane' }).click();
  await expect(page.getByText('Påmeldinga slettar vi 90 dagar etter seminaret.', { exact: false })).toBeVisible();
  await expect(page.getByText('så lenge du vil ha invitasjonar', { exact: false })).toBeVisible();
  // Only the required box: no consent to invitations goes with the form.
  const [request] = await Promise.all([sent(page), page.getByRole('button', { name: 'Meld meg på' }).click()]);
  expect(request.postDataJSON()).toMatchObject({ consent: 'pamelding-v1' });
  expect(request.postDataJSON()).not.toHaveProperty('invite');
  await expect(page.locator('h1')).toHaveText('Du er påmeld');
  await expect(page.locator('h1')).toBeFocused();
  await noSideways(page, 360);
  await page.screenshot({ path: info.outputPath('pameld-360-nn-light.png'), fullPage: true });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Legg i kalenderen' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('seminar.ics');
  const ics = readFileSync(await download.path(), 'utf8');
  expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(ics).toContain('DTSTART:20991105T080000Z\r\n');
  expect(ics).toContain('SUMMARY:Passord og MFA i kvardagen\r\n');
  for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
});

test('English: the box for invitations, ticked, goes with the form', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/s?c=${state().seminar_open.code}`);
  await page.locator('#sprak-en').click();
  await twoBoxes(page, 'en');
  await page.locator('#sem-namn').fill('ZZ E2E Participant');
  await page.getByLabel('Syntetisk Daco').check();
  await page.locator('#sem-epost').fill(`zz-e2e-en-${Date.now()}@example.test`);
  await page.getByRole('checkbox', { name: BOXES.en[1], exact: true }).check();
  await page.getByRole('button', { name: 'Register me' }).click();
  await expect(
    page.getByText('Tick the box that lets us store your details for the registration, then you can register.'),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: BOXES.en[0], exact: true }).check();
  const [request] = await Promise.all([sent(page), page.getByRole('button', { name: 'Register me' }).click()]);
  expect(request.postDataJSON()).toMatchObject({ consent: 'pamelding-v1', invite: 'invitasjon-v1', lang: 'en' });
  await expect(page.locator('h1')).toHaveText('You are registered');
});

test('after the seminar: the material, no form; a broken link has its own screen', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/s?c=${state().seminar_held.code}`);
  await expect(page.getByText('Seminaret er over')).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  const link = page.getByRole('link', { name: /Lysark frå seminaret/ });
  await expect(link).toHaveAttribute('href', 'https://example.test/lysark.pdf');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('#sprak-en')).toHaveCount(0);
  await noSideways(page, 360);
  await page.screenshot({ path: info.outputPath('materiell-360-nn-light.png'), fullPage: true });
  await page.goto('/s?c=AAAAAAAAAAAAAAAAAAAAAA');
  await expect(page.locator('h1')).toHaveText('Denne lenkja verkar ikkje');
  await expect(page.getByText('post@vardahei.no')).toBeVisible();
});
