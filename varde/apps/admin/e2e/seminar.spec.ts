// Seminar (3a) end to end: create a seminar → its link → registration on the public page with both
// boxes ticked → the registration is in the admin list (read on request) with «Invitasjon: ja» →
// «Last ned invitasjon», the calendar file and the poster → «Ny lenkje» → the admin corrects the
// contact and withdraws its consent to invitations → deletion by e-mail on «Sletting».
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { login } from './support.js';

test('create → link → register on /s → visible in the list → invitation, ICS and poster → delete by e-mail', async ({
  page,
  context,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.getByRole('link', { name: 'Seminar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seminar', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Nytt seminar' }).click();
  const form = page.getByRole('form', { name: 'Nytt seminar' });
  await form.getByLabel('Tema', { exact: true }).fill('Passord og MFA i kvardagen');
  await form.getByLabel('English').check();
  await form.getByLabel('Tema på engelsk').fill('Passwords and MFA at work');
  await form.getByLabel('Dato').fill('2099-11-05');
  await form.getByLabel('Frå').fill('09:00');
  await form.getByLabel('Til').fill('11:30');
  await form.getByLabel('Stad').fill('Vardahei IT, Sogndal');
  await form.getByLabel('Syntetisk admin kunde').check();
  await form.getByRole('button', { name: 'Lag seminaret' }).click();
  await expect(page).toHaveURL(/\/admin\/seminars\/[0-9a-f-]{36}$/);
  await expect(page.locator('.sem-tittel')).toHaveText('Passord og MFA i kvardagen');
  await expect(page.locator('.sem-meta')).toContainText('torsdag 5. november 2099, kl. 09.00–11.30');
  await expect(page.getByTestId('pamelde')).toHaveText('0');
  const link = await page.getByRole('link', { name: 'Opne påmeldingssida' }).getAttribute('href');
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:3100\/s\?c=[A-Za-z0-9_-]{22}$/);

  // The public page, as a participant would open it from the invitation.
  const pub = await context.newPage();
  await pub.emulateMedia({ reducedMotion: 'reduce' });
  await pub.goto(link!);
  await expect(pub.locator('h1')).toHaveText('Passord og MFA i kvardagen');
  await pub.locator('#sem-namn').fill('ZZ E2E Deltakar');
  await pub.getByLabel('Syntetisk admin kunde').check();
  const email = `zz-e2e-${Date.now()}@example.test`;
  await pub.locator('#sem-epost').fill(email);
  // Two boxes (decision 16.10): the required one, and the one for invitations, not ticked by default.
  await expect(pub.locator('#sem-invitasjon')).not.toBeChecked();
  await pub.locator('#sem-samtykke').check();
  await pub.locator('#sem-invitasjon').check();
  await pub.getByRole('button', { name: 'Meld meg på' }).click();
  await expect(pub.locator('h1')).toHaveText('Du er påmeld');
  const [calendar] = await Promise.all([
    pub.waitForEvent('download'),
    pub.getByRole('button', { name: 'Legg i kalenderen' }).click(),
  ]);
  expect(readFileSync(await calendar.path(), 'utf8')).toContain('SUMMARY:Passord og MFA i kvardagen\r\n');
  await pub.close();

  // Back in the admin: the count follows live, the names only on request.
  await expect(page.getByTestId('pamelde')).toHaveText('1');
  await expect(page.locator('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Vis namnelista' }).click();
  const table = page.locator('table.sem-pamelde');
  await expect(table).toContainText('ZZ E2E Deltakar');
  await expect(table).toContainText('Syntetisk admin kunde');
  await expect(table).toContainText(email);
  await expect(table.getByRole('columnheader', { name: 'Invitasjon' })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'ja', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('admin-seminar-pamelding.png'), fullPage: true });

  // «Invitasjon»: the letter, the package, the calendar file and the poster; nothing is sent.
  await page.getByRole('group', { name: 'Del' }).getByRole('button', { name: 'Invitasjon' }).click();
  await expect(page.locator('textarea')).toHaveValue(/Vardahei IT inviterer til seminaret «Passord og MFA i kvardagen»\./);
  await expect(page.locator('textarea')).toHaveValue(new RegExp(link!.replace(/[.?]/g, '\\$&')));
  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Last ned invitasjon' }).click(),
  ]);
  expect(zip.suggestedFilename()).toBe('invitasjon-seminar.zip');
  const bytes = readFileSync(await zip.path());
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  for (const name of ['LES-MEG.txt', 'invitasjon.txt', 'invitation-en.txt', 'seminar.ics', 'plakat.html', 'plakat-en.html', 'lenkje-til-pamelding.txt'])
    expect(bytes.includes(Buffer.from(name)), name).toBe(true);
  const [ics] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Kalenderfil (ICS)' }).click(),
  ]);
  expect(ics.suggestedFilename()).toBe('seminar.ics');
  expect(readFileSync(await ics.path(), 'utf8')).toMatch(/^BEGIN:VCALENDAR\r\n[\s\S]*Meld deg på her:/);
  const [poster] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Opne plakaten (A4)' }).click(),
  ]);
  await poster.waitForLoadState();
  await expect(poster.locator('h1')).toHaveText('Passord og MFA i kvardagen');
  await expect(poster.locator('.qr svg')).toBeVisible();
  await poster.screenshot({ path: info.outputPath('admin-seminar-plakat.png'), fullPage: true });
  await poster.close();
  await page.screenshot({ path: info.outputPath('admin-seminar-invitasjon.png'), fullPage: true });

  // «Ny lenkje» in two presses: the old link and the old posters say the link was replaced.
  await page.getByRole('group', { name: 'Del' }).getByRole('button', { name: 'Påmelding' }).click();
  await page.getByRole('button', { name: 'Ny lenkje', exact: true }).click();
  await page.getByRole('button', { name: 'Stadfest ny lenkje' }).click();
  await expect(page.getByRole('link', { name: 'Opne påmeldingssida' })).not.toHaveAttribute('href', link!);
  const old = await context.newPage();
  await old.goto(link!);
  await expect(old.locator('h1')).toHaveText('Lenkja er bytt ut');
  await old.close();

  // The admin corrects the contact; the public form never could.
  await page.getByRole('button', { name: 'Vis namnelista' }).click();
  await page.getByRole('button', { name: 'Endre ZZ E2E Deltakar' }).click();
  const edit = page.getByRole('form', { name: 'Endre kontakten' });
  await edit.getByLabel('Namn').fill('ZZ E2E Retta');
  await edit.getByLabel('Ta bort samtykket til invitasjonar').check();
  // The viewport only: a full-page shot of a scrolled page draws the sticky bars in the middle.
  await page.screenshot({ path: info.outputPath('admin-seminar-endre-kontakt.png') });
  await edit.getByRole('button', { name: 'Lagre kontakten' }).click();
  await expect(page.locator('table.sem-pamelde')).toContainText('ZZ E2E Retta');
  await expect(page.locator('table.sem-pamelde').getByRole('cell', { name: 'nei', exact: true })).toBeVisible();
  // Read again from the server: the consent is gone, only the person can give it again.
  await page.reload();
  await page.getByRole('button', { name: 'Vis namnelista' }).click();
  await expect(page.locator('table.sem-pamelde').getByRole('cell', { name: 'nei', exact: true })).toBeVisible();

  // «Sletting», area «Deltakar»: the contact and the registration go, by e-mail.
  await page.getByRole('link', { name: 'Sletting', exact: true }).click();
  await page.getByLabel('Område').selectOption('participant');
  await page.getByLabel('E-post').fill(email.toUpperCase());
  await page.getByLabel('Grunngjeving').fill('Syntetisk førespurnad');
  await page.getByRole('button', { name: 'Vis førehandsvising' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Kontakten og 1 påmelding blir sletta.' })).toBeVisible();
  await page.getByRole('button', { name: 'Stadfest sletting' }).click({ delay: 1400 });
  await expect(page.getByText('Deltakaren er sletta.')).toBeVisible();
  await page.getByRole('link', { name: 'Seminar', exact: true }).click();
  await expect(page.locator('.sem-liste').getByText('0 påmelde').first()).toBeVisible();

  // The section on a phone: no sideways scroll.
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
