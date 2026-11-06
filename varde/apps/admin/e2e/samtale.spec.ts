// 2.20 Samtalar end to end: a guide from «Nytt skjema → Samtale», published; a round with the fixture
// client; the start; typing, the rating by keyboard and a reload that keeps everything; the network gone
// while typing and back; the summary with «Vis for kunden»; «Fullfør» locks; the client page lists it.
import { expect, test, type Page } from '@playwright/test';
import { login, menu, state } from './support.js';

/** Saved on the server: «Lagra 14:32», not «Lagrar …» (a save still on its way). */
const saved = (page: Page) =>
  page.locator('.sm-topp .sm-lagra').filter({ hasText: /^(Lagra \d|Alt er lagra)/ });

/** The guide as «Nytt skjema → Samtale» makes it, published with Nynorsk only. */
async function publishedGuide(page: Page, title: string) {
  const created = await page.request.post('/api/admin/surveys', {
    data: { title, audience: 'interview', identification: 'none', required_languages: ['nn'] },
  });
  expect(created.status()).toBe(201);
  const guide = ((await created.json()) as { id: string }).id;
  const hash = async () =>
    (
      (await (await page.request.get(`/api/admin/surveys/versions/${guide}`)).json()) as {
        content_hash: string;
      }
    ).content_hash;
  await page.request.post(`/api/admin/surveys/versions/${guide}/accept`, {
    data: { content_hash: await hash(), lang: 'nn' },
  });
  const published = await page.request.post(`/api/admin/surveys/versions/${guide}/publish`, {
    data: { content_hash: await hash(), confirmed: true },
  });
  expect(published.status()).toBe(201);
  return guide;
}

test('a conversation at the table is saved field by field, through a reload and a lost network', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page);
  const s = await state(page);
  const guide = await publishedGuide(page, `Kartlegging nøkkelpersonar ${s.mark}`);

  // A round with the fixture client, made in «Samtalar».
  await menu(page, 'Samtalar');
  await expect(page.getByRole('heading', { name: 'Samtalar', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Ny samtalerunde' }).click();
  const ny = page.getByRole('dialog', { name: 'Ny samtalerunde' });
  await ny.getByLabel('Namn').fill(`Haust ${s.mark}`);
  await ny.getByLabel('Samtaleguide').selectOption(guide);
  await ny.getByLabel('Finn kunde').fill('Syntetisk admin kunde');
  await ny.getByRole('checkbox', { name: 'Syntetisk admin kunde' }).check();
  await ny.getByRole('button', { name: 'Lag runda' }).click();
  await expect(page.getByRole('heading', { name: /Ikkje starta/ })).toBeVisible();

  // The start: who sits at the table.
  await page.getByRole('button', { name: 'Start samtale' }).click();
  const start = page.getByRole('dialog', { name: 'Start samtale med Syntetisk admin kunde' });
  await start.getByLabel('Namn (valfritt)').fill('Kari Nordmann');
  await start.getByRole('button', { name: 'Start samtalen' }).click();
  await expect(
    page.getByRole('heading', { name: 'Syntetisk admin kunde', level: 1 }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.locator('.sm-q')).toContainText('ansvaret for IT');

  // Question 1: what the client says, the rating by keyboard while typing, the conclusion.
  const answer = page.getByLabel('Kva seier kunden?');
  await answer.fill('Ingen definert ansvarleg, men det går naturleg til dagleg leiar.');
  await page.keyboard.press('Alt+Digit2');
  await expect(page.getByRole('radio', { name: /Forbetringspotensial/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(answer).toHaveValue(
    'Ingen definert ansvarleg, men det går naturleg til dagleg leiar.',
  );
  await page
    .getByLabel('Konklusjon og tiltak')
    .fill('Peik ut ein IT-ansvarleg og ein stadfortredar.');
  await page.getByRole('button', { name: 'Eige notat' }).click();
  await page.getByLabel('Eige notat').fill('Kandidat for beredskapspakken.');
  await expect(saved(page)).toBeVisible();

  // A reload keeps everything, and the list shows the rating and the note.
  await page.reload();
  await expect(page.getByLabel('Kva seier kunden?')).toHaveValue(
    'Ingen definert ansvarleg, men det går naturleg til dagleg leiar.',
  );
  await expect(page.getByLabel('Konklusjon og tiltak')).toHaveValue(
    'Peik ut ein IT-ansvarleg og ein stadfortredar.',
  );
  await expect(page.getByLabel('Eige notat')).toHaveValue('Kandidat for beredskapspakken.');
  await expect(page.getByRole('radio', { name: /Forbetringspotensial/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // The network goes: typing goes on, the change waits on this machine and is saved when it is back.
  await page.context().setOffline(true);
  await page.getByLabel('Kva seier kunden?').fill('Skrive medan nettet var borte.');
  await expect(page.locator('.sm-topp .sm-lagra')).toContainText(
    'Ventar på nett · 1 endring ligg på denne maskina',
  );
  await page.context().setOffline(false);
  await expect(saved(page)).toBeVisible({ timeout: 20_000 });
  const back = (await (await page.request.get(`/api/admin/interviews/${id}`)).json()) as {
    answers: Record<string, { answer: string; rating: string; note: string }>;
  };
  expect(back.answers.N2).toMatchObject({
    answer: 'Skrive medan nettet var borte.',
    rating: 'forbetring',
    note: 'Kandidat for beredskapspakken.',
  });

  // ⌥↓ goes to the next question; ⌥3 rates it Manglar.
  await page.getByLabel('Kva seier kunden?').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('.sm-q')).toContainText('informerte');
  await page.keyboard.press('Alt+Digit3');
  await expect(page.getByRole('radio', { name: /Manglar/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(saved(page)).toBeVisible();

  // The summary: the notes hide for the client; «Fullfør» locks the conversation.
  await page.getByRole('link', { name: 'Oppsummering' }).click();
  await expect(page.getByRole('heading', { name: 'Oppsummering' })).toBeVisible();
  await expect(page.getByText('25 spørsmål er ikkje vurderte:')).toBeVisible();
  await expect(page.getByText('Kandidat for beredskapspakken.')).toBeVisible();
  await page.getByLabel('Vis for kunden').check();
  await expect(page.getByText('Kandidat for beredskapspakken.')).toHaveCount(0);
  await page.getByLabel('Vis for kunden').uncheck();
  await page.getByLabel('Samla inntrykk').fill('God merksemd i leiinga.');
  await page.getByRole('button', { name: 'Fullfør samtalen' }).first().click();
  await expect(page.getByText(/Samtalen er låst/)).toBeVisible();
  await expect(page.getByLabel('Samla inntrykk')).toHaveJSProperty('readOnly', true);
  const done = (await (await page.request.get(`/api/admin/interviews/${id}`)).json()) as {
    status: string;
    summary: string;
  };
  expect(done).toMatchObject({ status: 'done', summary: 'God merksemd i leiinga.' });

  // The client page lists the conversation.
  await page.goto(`/admin/clients/${s.client}`);
  const block = page.getByRole('region', { name: 'Samtalar' });
  await expect(block.getByText(`Haust ${s.mark}`)).toBeVisible();
  await expect(block.getByText(/Fullført/)).toBeVisible();
});

test('two screens on one field: the later save stops, nothing typed is lost, the person chooses', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  const s = await state(page);
  const guide = await publishedGuide(page, `Samtaleguide konflikt ${s.mark}`);
  const made = await page.request.post('/api/admin/interview-rounds', {
    data: { name: `Konflikt ${s.mark}`, template_version_id: guide, clients: [s.client] },
  });
  expect(made.status()).toBe(201);
  const round = ((await made.json()) as { id: string }).id;
  const view = (await (await page.request.get(`/api/admin/interview-rounds/${round}`)).json()) as {
    interviews: { id: string }[];
  };
  const id = view.interviews[0]!.id;
  const started = await page.request.post(`/api/admin/interviews/${id}/start`, {
    data: { held_on: '2026-11-10', interviewees: [{ role: 'dagleg leiar' }] },
  });
  expect(started.ok()).toBe(true);
  const server = async () =>
    (
      (await (await page.request.get(`/api/admin/interviews/${id}`)).json()) as {
        answers: Record<string, { answer: string }>;
      }
    ).answers.N2?.answer;

  // Both screens open the conversation; the other one writes first.
  await page.goto(`/admin/samtalar/${id}`);
  await expect(page.getByLabel('Kva seier kunden?')).toHaveValue('');
  const other = await page.context().newPage();
  await other.goto(`/admin/samtalar/${id}`);
  await other.getByLabel('Kva seier kunden?').fill('Skrive på den andre skjermen.');
  await expect(saved(other)).toBeVisible();

  // This screen still holds the empty field: its save stops and asks; the text stays.
  await page.getByLabel('Kva seier kunden?').fill('Skrive her.');
  const here = page.getByRole('alert').filter({ hasText: 'på ein annan skjerm' });
  await expect(here).toContainText('Skrive på den andre skjermen.');
  await expect(page.getByLabel('Kva seier kunden?')).toHaveValue('Skrive her.');
  expect(await server()).toBe('Skrive på den andre skjermen.');
  await here.getByRole('button', { name: 'Behald mitt' }).click();
  await expect(here).toHaveCount(0);
  await expect(saved(page)).toBeVisible();
  expect(await server()).toBe('Skrive her.');

  // The other screen meets that change in turn and takes it.
  await other.getByLabel('Kva seier kunden?').fill('Skrive på den andre skjermen. Meir.');
  const there = other.getByRole('alert').filter({ hasText: 'på ein annan skjerm' });
  await expect(there).toContainText('Skrive her.');
  await there.getByRole('button', { name: 'Bruk deira' }).click();
  await expect(other.getByLabel('Kva seier kunden?')).toHaveValue('Skrive her.');
  await expect(there).toHaveCount(0);
  expect(await server()).toBe('Skrive her.');
});
