// Live questions (3b) end to end: the admin makes a seminar of today and its live poll, makes the
// presenter link and opens the big screen; opens a question → three phones answer in live mode →
// close → a fourth phone is told «Spørsmålet er stengt» → show → the big screen draws the bars.
// Then the presenter runs the next question from the big screen itself; one answer stays below
// k = 3 («For få svar til å vise tal»). Revoking the link stops the big screen. 360 and 1280 px,
// light and dark; nothing leaves the site; the key never travels in a URL the server sees.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { login, state } from './support.js';

const today = () =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

/** Requests that leave 127.0.0.1, and every URL the browser asked for (the key must not be in one). */
function watch(page: Page) {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}
/** No sideways scroll; on failure the message names the elements that stick out. */
async function noSideways(page: Page, width: number) {
  const wide = await page.evaluate((w) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.right > w + 0.5)
        out.push(
          `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')} ${Math.round(r.right)}`,
        );
    }
    return { scroll: document.documentElement.scrollWidth, out: out.slice(0, 8) };
  }, width);
  expect(wide.scroll, wide.out.join(', ')).toBeLessThanOrEqual(width);
}
/** Light ↔ dark: wait until the colours have settled (transitions of body and buttons). */
async function scheme(page: Page, colorScheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme });
  await page.waitForTimeout(400);
}

async function phone(browser: Browser, link: string, scheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({
    viewport: { width: 360, height: 760 },
    isMobile: true,
    hasTouch: true,
    colorScheme: scheme,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(link);
  return page;
}

test('admin opens a question → three phones answer → close → show → bars on the big screen', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  const s = await state(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.setViewportSize({ width: 1280, height: 1100 });
  const d = today();
  await page.getByRole('link', { name: 'Seminar', exact: true }).click();
  await page.getByRole('button', { name: 'Nytt seminar' }).click();
  const form = page.getByRole('form', { name: 'Nytt seminar' });
  await form.getByLabel('Tema', { exact: true }).fill('Live-spørsmål i praksis');
  await form.getByLabel('Dato').fill(`${d.year}-${d.month}-${d.day}`);
  await form.getByLabel('Frå').fill('00:30');
  await form.getByLabel('Til').fill('23:30');
  await form.getByLabel('Stad').fill('Vardahei IT, Sogndal');
  await form.getByLabel('Syntetisk admin kunde').check();
  await form.getByRole('button', { name: 'Lag seminaret' }).click();
  await expect(page).toHaveURL(/\/admin\/seminars\/[0-9a-f-]{36}$/);

  // «Live»: make the poll from the version made for it.
  await page.getByRole('group', { name: 'Del' }).getByRole('button', { name: 'Live' }).click();
  await page.getByLabel('Skjema').selectOption(s.live_version);
  await page.getByRole('button', { name: 'Lag live-spørsmål' }).click();
  await expect(page.getByTestId('live-lenkje')).toBeVisible();
  const phones = (await page.getByTestId('live-lenkje').textContent())!;
  expect(phones).toMatch(/^http:\/\/127\.0\.0\.1:3100\/r\?c=[A-Za-z0-9_-]{22}$/);

  // The presenter link, shown once; the big screen opens without a login.
  await page.getByRole('button', { name: 'Lag lenkje til storskjermen' }).click();
  const presenterLink = (await page.getByTestId('storskjerm-lenkje').textContent())!;
  expect(presenterLink).toMatch(/^http:\/\/127\.0\.0\.1:3100\/p#t=[A-Za-z0-9_-]{43}$/);
  const key = presenterLink.split('#t=')[1]!;
  const screenContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  const screen = await screenContext.newPage();
  const screenUrls = watch(screen);
  await screen.goto(presenterLink);
  await expect(screen.locator('.storskjerm h1')).toHaveText('Svar på mobilen');
  await expect(screen.locator('.qr-kode svg')).toBeVisible();
  await expect(screen.locator('.samband')).toHaveText('Tilkopla');
  expect(screen.url()).toBe('http://127.0.0.1:3100/p');
  await screen.screenshot({ path: info.outputPath('storskjerm-1280-light-start.png') });

  // The admin opens question 1; the phones see it.
  await page.getByRole('button', { name: 'Opne spørsmålet' }).click();
  await expect(page.locator('.tilstand-stig .no')).toHaveText('Ope');
  await expect(screen.locator('.storskjerm h1')).toHaveText('Kva arbeider du mest med?');
  const answers = ['kontor', 'kontor', 'sal'];
  const opened: Page[] = [];
  for (const [i, option] of answers.entries()) {
    const p = await phone(browser, phones, i === 1 ? 'dark' : 'light');
    opened.push(p);
    await expect(p.locator('h1')).toHaveText('Kva arbeider du mest med?');
    if (i === 0)
      await p.screenshot({ path: info.outputPath('mobil-360-light-sporsmal.png'), fullPage: true });
    if (i === 1)
      await p.screenshot({ path: info.outputPath('mobil-360-dark-sporsmal.png'), fullPage: true });
    await noSideways(p, 360);
    await p.locator(`.opt[data-id="${option}"]`).click();
    await expect(p.locator('h1')).toHaveText('Takk!');
    // «N har svart» with k = 3: below three only that there are fewer, no number.
    if (i < 2) await expect(screen.locator('.svart')).toHaveText('Færre enn tre har svart');
  }
  await opened[0]!.screenshot({
    path: info.outputPath('mobil-360-light-takk.png'),
    fullPage: true,
  });
  await expect(screen.locator('.svart')).toHaveText('3 har svart');
  await expect(page.getByTestId('har-svart')).toHaveText('3 har svart');
  await screen.screenshot({ path: info.outputPath('storskjerm-1280-light-ope.png') });
  await page.screenshot({ path: info.outputPath('admin-live-1280-light-ope.png') });

  // A fourth phone has the question open but does not answer in time.
  const late = await phone(browser, phones);
  await expect(late.locator('h1')).toHaveText('Kva arbeider du mest med?');
  await page.getByRole('button', { name: 'Steng spørsmålet' }).click();
  await expect(screen.locator('.tilstand')).toHaveText('Stengt');
  await expect(late.locator('h1')).toHaveText('Spørsmålet er stengt', { timeout: 10_000 });
  await late.screenshot({ path: info.outputPath('mobil-360-light-stengt.png'), fullPage: true });

  // «Vis resultatet»: the bars on the big screen and in the admin.
  await page.getByRole('button', { name: 'Vis resultatet' }).click();
  await expect(screen.locator('.stolpar .rad')).toHaveCount(3);
  await expect(screen.locator('.stolpar .prosent')).toHaveText(['67 %', '33 %', '0 %']);
  await expect(page.locator('.poll-rad b')).toHaveText(['67 %', '33 %', '0 %']);
  await screen.screenshot({ path: info.outputPath('storskjerm-1280-light-vist.png') });
  await scheme(screen, 'dark');
  await screen.screenshot({ path: info.outputPath('storskjerm-1280-dark-vist.png') });
  await scheme(page, 'dark');
  await page.screenshot({ path: info.outputPath('admin-live-1280-dark-vist.png') });
  await scheme(page, 'light');

  // The presenter runs question 2 from the big screen; one answer stays below k = 3.
  await screen.locator('#styr-open').click();
  await expect(screen.locator('.storskjerm h1')).toHaveText(
    'Brukar du tofaktor (MFA) på jobb-e-posten?',
  );
  await expect(opened[0]!.locator('h1')).toHaveText('Brukar du tofaktor (MFA) på jobb-e-posten?', {
    timeout: 10_000,
  });
  await opened[0]!.locator('.opt[data-id="ja"]').click();
  await expect(opened[0]!.locator('h1')).toHaveText('Takk!');
  await expect(screen.locator('.svart')).toHaveText('Færre enn tre har svart');
  await screen.locator('#styr-close').click();
  await screen.locator('#styr-release').click();
  await expect(screen.locator('.for-fa b')).toHaveText('For få svar til å vise tal');
  await expect(screen.locator('.stolpar')).toHaveCount(0);
  await screen.screenshot({ path: info.outputPath('storskjerm-1280-dark-for-fa.png') });
  await expect(page.getByText('For få svar til å vise tal')).toBeVisible();

  // The big screen at 360 px still works (a presenter on a phone).
  await screen.setViewportSize({ width: 360, height: 780 });
  await noSideways(screen, 360);
  await screen.screenshot({ path: info.outputPath('storskjerm-360-dark.png'), fullPage: true });

  // No request left the site, and no URL carried the key.
  for (const url of screenUrls) {
    expect(new URL(url).hostname).toBe('127.0.0.1');
    expect(url).not.toContain(key);
  }

  // «Trekk tilbake»: the big screen stops at once.
  await page.getByRole('button', { name: 'Trekk tilbake' }).click();
  await page.getByRole('button', { name: 'Stadfest: trekk tilbake' }).click();
  await expect(screen.getByRole('alert')).toContainText('trekt tilbake', { timeout: 10_000 });
  await screenContext.close();
  for (const p of [...opened, late]) await p.context().close();
});
