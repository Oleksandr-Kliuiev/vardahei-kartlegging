// The findings a seminar takes up (2.17) end to end. A new seminar for the fixture client
// (e2e/server.cjs «kunde»: one closed round with findings F12 and F14) takes up none yet and links
// to the client; the client page takes the MFA finding up at the seminar; the seminar page then
// shows it — client, round, numbers, text and «I seminar» — under the topic as heading and tab
// title; «Endre status hos …» opens the client page on that round with the focus on «Funn» (on a
// phone the page comes up to it), and «Ferdig» shows on the seminar page. The test leaves the
// findings open, as the fixture made them.
import { expect, test } from '@playwright/test';
import { login, state } from './support.js';

const NAME = 'Syntetisk kunde med funn';
const TOPIC = 'ZZ Seminar som tek opp funn';
const MFA = /^Endre status for funnet: 2 av 6 .*MFA/;

test('a seminar shows the findings it takes up; the status is changed on the client page', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  const { kunde } = await state(page);
  const made = await page.request.post('/api/admin/seminars', {
    data: {
      topic_nn: TOPIC,
      date: '2099-11-19',
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

  // None yet: one sentence, and the way to «Funn» on the client page where findings are taken up.
  await page.goto(`/admin/seminars/${seminar}`);
  await expect(page.getByRole('heading', { name: TOPIC, level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(`${TOPIC} – Varde`);
  const block = page.getByRole('region', { name: 'Funn seminaret tek opp' });
  await expect(block).toContainText('Ingen funn er knytte til seminaret.');
  await block.getByRole('link', { name: NAME, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/clients/${kunde.client}\\?funn$`));
  await expect(page.getByRole('region', { name: 'Funn' })).toBeFocused();

  // The client page, the one place to change the status, takes the MFA finding up at the seminar.
  const funn = () =>
    page.getByRole('region', { name: 'Funn' }).locator('.funn li').filter({ hasText: 'MFA' });
  await funn().getByRole('button', { name: MFA }).click();
  await funn()
    .getByRole('combobox')
    .selectOption({ label: `I seminar: ${TOPIC} (19.11.2099)` });
  await funn().getByRole('button', { name: 'Lagre', exact: true }).click();
  await expect(funn().locator('.chip')).toHaveText('I seminar');

  // The seminar page shows it with the client, the round and the text of the client page.
  await funn()
    .getByRole('link', { name: `${TOPIC} · 19.11.2099` })
    .click();
  await expect(page).toHaveURL(new RegExp(`/admin/seminars/${seminar}$`));
  await expect(page).toHaveTitle(`${TOPIC} – Varde`);
  await expect(block.locator('.kort-hovud p')).toHaveText('1 funn');
  await expect(block.locator('h3')).toHaveText(`${NAME} ${kunde.name}`);
  const row = block.locator('.funn li');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.niva')).toHaveText(/^(Høg|Middels)$/);
  await expect(row.locator('.sem-funn-tekst')).toHaveText(/^2 av 6 .*MFA/);
  await expect(row.locator('.chip')).toHaveText('I seminar');
  await expect(block.getByRole('button')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('seminar-funn.png'), fullPage: true });

  // The list has its own title; the seminar keeps the topic also when it comes from cache.
  await page.getByRole('link', { name: 'Alle seminar' }).click();
  await expect(page).toHaveTitle('Seminar – Varde');
  await page.locator(`a[href="/admin/seminars/${seminar}"]`).click();
  await expect(page).toHaveTitle(`${TOPIC} – Varde`);
  await expect(row.locator('.chip')).toHaveText('I seminar');

  // «Endre status hos …» opens the client page on the round of the finding, the focus on «Funn»;
  // «Ferdig» shows on the seminar page.
  await block.getByRole('link', { name: `Endre status hos ${NAME}` }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/clients/${kunde.client}\\?runde=${kunde.round}$`),
  );
  await expect(page.getByRole('region', { name: 'Funn' })).toContainText(kunde.name);
  await expect(page.getByRole('region', { name: 'Funn' })).toBeFocused();
  await funn().getByRole('button', { name: MFA }).click();
  await funn().getByRole('combobox').selectOption({ label: 'Ferdig' });
  await funn().getByRole('button', { name: 'Lagre', exact: true }).click();
  await expect(funn().locator('.chip')).toHaveText('Ferdig');
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/admin/seminars/${seminar}$`));
  await expect(row.locator('.chip')).toHaveText('Ferdig');

  // On a phone: no sideways scroll; the text takes the width, the level above it, the status
  // inside the text box right after the words.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();
  await expect(row.locator('.chip')).toHaveText('Ferdig');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const level = (await row.locator('.niva').boundingBox())!;
  const text = (await row.locator('.sem-funn-tekst').boundingBox())!;
  const chip = (await row.locator('.chip').boundingBox())!;
  expect(text.width).toBeGreaterThan(250);
  expect(Math.abs(level.x - text.x)).toBeLessThanOrEqual(1);
  expect(text.y).toBeGreaterThan(level.y);
  expect(chip.x + chip.width).toBeLessThanOrEqual(text.x + text.width + 1);
  expect(chip.y + chip.height).toBeLessThanOrEqual(text.y + text.height + 1);
  await page.screenshot({ path: info.outputPath('seminar-funn-telefon.png'), fullPage: true });
  // The client page is long on a phone: the link opens it at «Funn», top first, just under the
  // sticky top bar (scroll-margin 76 px), whatever the scroll of the page before.
  await block.getByRole('link', { name: `Endre status hos ${NAME}` }).click();
  const card = page.getByRole('region', { name: 'Funn' });
  await expect(card).toBeFocused();
  await expect.poll(async () => Math.round((await card.boundingBox())!.y)).toBeLessThanOrEqual(92);
  expect(Math.round((await card.boundingBox())!.y)).toBeGreaterThanOrEqual(60);
  await page.screenshot({ path: info.outputPath('kunde-frå-seminar-telefon.png') });

  // Leave the findings open, as the fixture made them.
  const status = (await (
    await page.request.get(`/api/admin/clients/${kunde.client}/finding-status`)
  ).json()) as { rows: { id: string; status: string }[] };
  for (const r of status.rows.filter((r) => r.status !== 'open'))
    expect(
      (
        await page.request.put(`/api/admin/findings/${r.id}/status`, { data: { status: 'open' } })
      ).status(),
    ).toBe(200);
});
