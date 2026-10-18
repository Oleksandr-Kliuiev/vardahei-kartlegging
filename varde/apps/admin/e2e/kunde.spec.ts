// The client page (2.17): the contacts of the client only on request — how many first, names and
// e-mail after «Vis kontaktane», each read in the log — and the follow-up of each finding: open,
// taken up at one of the client's seminars (with a link there), done. The fixture client
// (e2e/server.cjs «kunde») has one closed round with two findings and no other round.
import { expect, test } from '@playwright/test';
import { login, personvern, state } from './support.js';

const NAME = 'Syntetisk kunde med funn';

test('contacts on request with a log entry; a finding taken up at a seminar, then done', async ({
  page,
}, info) => {
  await login(page);
  const { kunde } = await state(page);
  // A seminar for the client, and a registration from it as the public page makes one.
  const made = await page.request.post('/api/admin/seminars', {
    data: {
      topic_nn: 'ZZ Phishing for kunden',
      date: '2099-11-12',
      start: '09:00',
      end: '11:00',
      place: 'Vardahei IT, Sogndal',
      format: 'onsite',
      languages: ['nn'],
      clients: [kunde.client],
    },
  });
  expect(made.status()).toBe(201);
  const seminar = ((await made.json()) as { id: string }).id;
  const { link } = (await (await page.request.get(`/api/admin/seminars/${seminar}`)).json()) as {
    link: string;
  };
  const bearer = { authorization: `Bearer ${new URL(link).searchParams.get('c')}` };
  const pub = (await (
    await page.request.get('/api/public/seminar', { headers: bearer })
  ).json()) as {
    clients: { key: string; name: string }[];
    consent: { version: string; invite_version: string };
  };
  const email = `zz-e2e-kunde-${Date.now()}@example.test`;
  const registered = await page.request.post('/api/public/seminar/registrations', {
    headers: bearer,
    data: {
      name: 'ZZ E2E Kontakt',
      email,
      company: { client: pub.clients.find((c) => c.name === NAME)!.key },
      consent: pub.consent.version,
      invite: pub.consent.invite_version,
      lang: 'nn',
    },
  });
  expect(registered.ok()).toBe(true);

  // The page: a count without names; the names come only when asked for, once.
  const reads: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith(`/api/admin/clients/${kunde.client}/contacts`)) reads.push(r.url());
  });
  await page.goto(`/admin/clients/${kunde.client}`);
  await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
  const contacts = page.getByRole('region', { name: 'Kontaktar' });
  await expect(contacts).toContainText(`1 kontakt hos ${NAME}.`);
  await expect(contacts).not.toContainText('ZZ E2E Kontakt');
  expect(reads).toEqual([]);
  await contacts.getByRole('button', { name: 'Vis kontaktane' }).click();
  await expect(contacts).toContainText('ZZ E2E Kontakt');
  await expect(contacts.getByRole('link', { name: email })).toHaveAttribute(
    'href',
    `mailto:${email}`,
  );
  await expect(contacts).toContainText('invitasjonar: ja');
  await expect(contacts.getByRole('link', { name: 'ZZ Phishing for kunden' })).toHaveAttribute(
    'href',
    `/admin/seminars/${seminar}`,
  );
  expect(reads).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('kunde-kontaktar.png'), fullPage: true });
  await contacts.getByRole('button', { name: 'Skjul kontaktane' }).click();
  await expect(contacts).not.toContainText(email);

  // The findings of the closed round, each open until someone follows it up.
  const funn = page.getByRole('region', { name: 'Funn' });
  await expect(funn).toContainText(kunde.name);
  await expect(funn.locator('.oppfolging')).toHaveCount(2);
  await expect(funn.locator('.oppfolging .chip')).toHaveText(['Open', 'Open']);
  const mfa = funn.locator('.funn li').filter({ hasText: 'MFA' });
  await mfa.getByRole('button', { name: /^Endre status for funnet: 2 av 6 .*MFA/ }).click();
  const choice = mfa.getByRole('combobox', { name: /^Status for funnet: 2 av 6 .*MFA/ });
  await expect(mfa.getByRole('button', { name: 'Lagre', exact: true })).toBeDisabled();
  await choice.selectOption({ label: 'I seminar: ZZ Phishing for kunden (12.11.2099)' });
  await mfa.getByRole('button', { name: 'Lagre', exact: true }).click();
  await expect(page.getByText('Status for funnet er lagra.')).toBeVisible();
  await expect(mfa.locator('.chip')).toHaveText('I seminar');
  await expect(mfa.getByText(/^Endra av .+ \d\d\.\d\d\.\d{4}$/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('kunde-funn.png'), fullPage: true });

  // Read again from the server; the link opens the seminar where the finding is taken up.
  await page.reload();
  const again = page.getByRole('region', { name: 'Funn' }).locator('.funn li').filter({
    hasText: 'MFA',
  });
  await expect(again.locator('.chip')).toHaveText('I seminar');
  await again.getByRole('link', { name: 'ZZ Phishing for kunden · 12.11.2099' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/seminars/${seminar}$`));
  await expect(page.locator('.sem-tittel')).toHaveText('ZZ Phishing for kunden');

  // Done: the finding keeps the seminar it was taken up at.
  await page.goBack();
  const done = page.getByRole('region', { name: 'Funn' }).locator('.funn li').filter({
    hasText: 'MFA',
  });
  await done.getByRole('button', { name: /^Endre status for funnet: 2 av 6 .*MFA/ }).click();
  await done.getByRole('combobox').selectOption({ label: 'Ferdig' });
  await done.getByRole('button', { name: 'Lagre', exact: true }).click();
  await expect(done.locator('.chip')).toHaveText('Ferdig');
  await expect(
    done.getByRole('link', { name: 'ZZ Phishing for kunden · 12.11.2099' }),
  ).toBeVisible();

  // The journal: the read of the names under the client, the changes of the finding.
  await personvern(page, 'Logg');
  const log = page.getByRole('region', { name: 'Logg' });
  await expect(log.locator('li').filter({ hasText: 'Deltakarar lesne' }).first()).toContainText(
    NAME,
  );
  await expect(log.locator('li').filter({ hasText: 'Funn endra' }).first()).toBeVisible();
  expect(await log.locator('li').filter({ hasText: 'Funn endra' }).count()).toBeGreaterThanOrEqual(
    2,
  );

  // The page on a phone: no sideways scroll, also with the editor open.
  await page.goto(`/admin/clients/${kunde.client}`);
  await page.setViewportSize({ width: 360, height: 780 });
  await page
    .getByRole('region', { name: 'Funn' })
    .getByRole('button', { name: /^Endre status for funnet: 2 av 6 .*MFA/ })
    .click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
