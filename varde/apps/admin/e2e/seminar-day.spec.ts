// The whole seminar (acceptance of stage 3) end to end on synthetic data: a seminar of today with
// two clients → registration on /s → the live poll with three phones, closed and shown → «Før og
// etter»: the card «Rundar» (before, live, after), «Før» linked to the closed round of both clients,
// «Etter» started with the round wizard (a post_seminar round, a link per client; the link opens the
// survey) → answers after → the comparison with its caveats, per question and per client. 360 and
// 1280 px, light and dark, no sideways scroll.
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { login, state } from './support.js';

const today = () => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return `${p.year}-${p.month}-${p.day}`;
};
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
/** The whole page in one viewport (a full-page shot would repeat the sticky header and menu). */
async function whole(page: Page, path: string) {
  const width = page.viewportSize()!.width;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(200);
  await page.screenshot({ path });
}
async function scheme(page: Page, colorScheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme });
  await page.waitForTimeout(400);
}
async function phone(browser: Browser, link: string) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 760 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(link);
  return page;
}
/** One synthetic answer of the survey after, as the runner sends it. */
async function submit(page: Page, code: string, F12: string, F14: string) {
  const response = await page.request.post('/api/runner/submissions', {
    headers: { authorization: `Bearer ${code}` },
    data: {
      submission_id: randomUUID(),
      part: 'common',
      lang: 'nn',
      answers: { F1: 'ZZETTER', F2: 'kontor', F12, F14 },
      duration_s: 90,
    },
  });
  expect(response.status()).toBe(201);
}

test('seminar with clients → /s → live with three phones → survey after → «Før og etter» with caveats', async ({
  page,
  browser,
  context,
}, info) => {
  test.setTimeout(180_000);
  const s = await state(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.setViewportSize({ width: 1280, height: 1100 });

  // The seminar of today, for both synthetic clients.
  await page.getByRole('link', { name: 'Seminar', exact: true }).click();
  await page.getByRole('button', { name: 'Nytt seminar' }).click();
  const form = page.getByRole('form', { name: 'Nytt seminar' });
  await form.getByLabel('Tema', { exact: true }).fill('Før og etter i praksis');
  await form.getByLabel('Dato').fill(today());
  await form.getByLabel('Frå').fill('00:30');
  await form.getByLabel('Til').fill('23:30');
  await form.getByLabel('Stad').fill('Vardahei IT, Sogndal');
  await form.getByLabel('Syntetisk admin kunde').check();
  await form.getByLabel('Syntetisk andre kunde').check();
  await form.getByRole('button', { name: 'Lag seminaret' }).click();
  await expect(page).toHaveURL(/\/admin\/seminars\/[0-9a-f-]{36}$/);

  // Registration on the public page.
  const link = (await page
    .getByRole('link', { name: 'Opne påmeldingssida' })
    .getAttribute('href'))!;
  const pub = await context.newPage();
  await pub.goto(link);
  await pub.locator('#sem-namn').fill('ZZ E2E Seminardag');
  await pub.getByLabel('Syntetisk andre kunde').check();
  await pub.locator('#sem-epost').fill(`zz-e2e-dag-${Date.now()}@example.test`);
  await pub.locator('#sem-samtykke').check();
  await pub.getByRole('button', { name: 'Meld meg på' }).click();
  await expect(pub.locator('h1')).toHaveText('Du er påmeld');
  await pub.close();
  await expect(page.getByTestId('pamelde')).toHaveText('1');

  // Live: three phones answer the first question; it is closed and shown.
  await page.getByRole('group', { name: 'Del' }).getByRole('button', { name: 'Live' }).click();
  await page.getByLabel('Skjema').selectOption(s.live_version);
  await page.getByRole('button', { name: 'Lag live-spørsmål' }).click();
  const phones = (await page.getByTestId('live-lenkje').textContent())!;
  await page.getByRole('button', { name: 'Opne spørsmålet' }).click();
  const opened: Page[] = [];
  for (const option of ['kontor', 'kontor', 'sal']) {
    const p = await phone(browser, phones);
    opened.push(p);
    await expect(p.locator('h1')).toHaveText('Kva arbeider du mest med?');
    await p.locator(`.opt[data-id="${option}"]`).click();
    await expect(p.locator('h1')).toHaveText('Takk!');
  }
  await expect(page.getByTestId('har-svart')).toHaveText(/^3 har svart/);
  await page.getByRole('button', { name: 'Steng spørsmålet' }).click();
  await page.getByRole('button', { name: 'Vis resultatet' }).click();
  await expect(page.locator('.poll-rad b')).toHaveText(['67 %', '33 %', '0 %']);
  for (const p of opened) await p.context().close();

  // «Før og etter»: the caveats at once, and the three steps of «Rundar».
  await page
    .getByRole('group', { name: 'Del' })
    .getByRole('button', { name: 'Før og etter' })
    .click();
  await expect(page.locator('.sem-atterhald li')).toHaveCount(4);
  await expect(page.locator('.sem-atterhald')).toContainText(
    'Vi ser endringa, men kan ikkje seie at seminaret gjorde det.',
  );
  await expect(page.getByTestId('fe-ikkje-klar')).toBeVisible();
  await expect(page.getByTestId('steg-for')).toContainText('Inga undersøking er kopla til');
  await expect(page.getByTestId('steg-live')).toContainText('1 av 3 spørsmål viste');
  await expect(page.getByTestId('steg-etter')).toContainText('Inga undersøking enno');
  await page.screenshot({
    path: info.outputPath('admin-rundar-1280-light-tom.png'),
    fullPage: true,
  });

  // «Før»: the closed round of both clients.
  const before = page.getByTestId('steg-for');
  await before.getByLabel('Vel undersøking før').selectOption(s.rounds.before!.id);
  await before.getByRole('button', { name: 'Kople til som «Før»' }).click();
  await expect(before).toContainText(s.rounds.before!.name);
  await expect(before).toContainText('Avslutta');
  await expect(page.getByTestId('svar-before')).toHaveText(
    '7 svar av 18 · Syntetisk admin kunde 4 av 12 · Syntetisk andre kunde 3 av 6',
  );

  // «Etter»: the round wizard for the seminar's clients, opened at once, a link per client.
  await page.getByRole('button', { name: 'Start undersøking etter seminaret' }).click();
  const wizard = page.locator('.sem-etter-start');
  await wizard.getByLabel('Namn på den nye runden').fill(`${s.mark}-etter`);
  await wizard.getByLabel('Versjon for den nye runden').selectOption(s.version);
  for (const name of ['Syntetisk admin kunde', 'Syntetisk andre kunde'])
    await wizard.getByLabel(`Frist for ${name}`).fill('2099-06-01');
  await wizard.getByLabel('Opne med ein gong').check();
  await wizard.getByRole('button', { name: 'Start undersøkinga' }).click();
  await expect(
    wizard.getByRole('heading', { name: 'Invitasjonar til den nye runden' }),
  ).toBeVisible();
  const links = wizard.getByLabel('Lenkje til kartlegginga');
  await expect(links).toHaveCount(2);
  const urls = await Promise.all([0, 1].map((i) => links.nth(i).inputValue()));
  const codes = urls.map((u) => new URL(u).searchParams.get('c')!);
  expect(urls.every((u) => u.startsWith('http://127.0.0.1:3100/r?c='))).toBe(true);
  await expect(page.getByTestId('steg-etter')).toContainText(`${s.mark}-etter`);
  await expect(page.getByTestId('steg-etter')).toContainText('Open til 1. juni');
  await wizard.getByRole('button', { name: 'Lukk' }).click();
  await expect(wizard).toHaveCount(0);
  // The link of the survey after opens the ordinary survey on a phone.
  const runner = await phone(browser, urls[0]!);
  await expect(runner.getByText('IT-sikkerheit i kvardagen').first()).toBeVisible();
  await runner.context().close();

  // Answers after the seminar: three from each client.
  for (const [F12, F14] of [
    ['ja', 'ja'],
    ['ja', 'ja'],
    ['delvis', 'ja'],
  ]) {
    await submit(page, codes[0]!, F12!, F14!);
    await submit(page, codes[1]!, F12!, F14!);
  }

  // The comparison: through privacy, with the caveats, per question and per client.
  await expect(page.getByTestId('fe-tal')).toHaveText(
    'Før seminaret: 7 svar (publiserte tal). Etter: 6 svar (levande tal).',
    { timeout: 10_000 },
  );
  const f12 = page.getByTestId('fe-F12');
  await expect(f12.locator('.poll-rad')).toHaveCount(4);
  await expect(f12.locator('.poll-rad').first()).toHaveAttribute(
    'aria-label',
    'Ja: før 29 %, etter 67 %',
  );
  await expect(f12.locator('.sem-fe-score')).toContainText('Snittscore 1,14 → 0,33');
  await expect(page.locator('.sem-fe-kundar tbody tr')).toHaveCount(3);
  await expect(page.locator('.sem-fe-kundar tbody tr').first()).toContainText(
    'Alle kundane på seminaret',
  );
  await expect(page.getByTestId('fe-samla')).toContainText('snittscore 0,86 → 0,17');
  await expect(page.locator('.sem-fe-innhald')).toContainText(
    'Same spørsmål og same utrekning i begge undersøkingane.',
  );
  await whole(page, info.outputPath('admin-for-etter-1280-light.png'));
  await scheme(page, 'dark');
  await whole(page, info.outputPath('admin-for-etter-1280-dark.png'));
  await page.setViewportSize({ width: 1280, height: 1100 });

  // One client.
  await page
    .getByRole('group', { name: 'Kunde' })
    .getByRole('button', { name: 'Syntetisk admin kunde' })
    .click();
  await expect(page.getByTestId('fe-tal')).toHaveText(
    'Før seminaret: 4 svar (publiserte tal). Etter: 3 svar (levande tal).',
  );
  await expect(page.locator('.sem-fe-kundar')).toHaveCount(0);
  await page.getByRole('group', { name: 'Kunde' }).getByRole('button', { name: 'Alle' }).click();

  // A phone-sized screen, both themes.
  await page.setViewportSize({ width: 360, height: 780 });
  await noSideways(page, 360);
  await whole(page, info.outputPath('admin-for-etter-360-dark.png'));
  await scheme(page, 'light');
  await noSideways(page, 360);
  await whole(page, info.outputPath('admin-for-etter-360-light.png'));
  await page
    .locator('.sem-rundar')
    .screenshot({ path: info.outputPath('admin-rundar-360-light.png') });
  await page.setViewportSize({ width: 360, height: 780 });

  // «Sjå i dashbordet» opens the dashboard on that round.
  await page.getByTestId('steg-for').getByRole('link', { name: 'Sjå i dashbordet' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/dashboard\\?round=${s.rounds.before!.id}$`));
  await expect(page.locator('#dashboard-round')).toHaveValue(s.rounds.before!.id);
});
