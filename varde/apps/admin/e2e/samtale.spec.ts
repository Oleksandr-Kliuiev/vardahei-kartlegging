// 2.20 Samtalar end to end: a guide from «Nytt skjema → Samtale», published; a round with the fixture
// client; the start; typing, the rating by keyboard and a reload that keeps everything; the network gone
// while typing and back; the summary with «Vis for kunden»; «Fullfør» locks; the client page lists it.
// 2.21: the referat and the CSV of Oversikt have the answer and not the note; Oversikt shows it.
// 2.22a: the criteria under the rating buttons, and a repeat conversation with «Førre gong» and
// «Før og etter» on the summary and the client page.
import { readFileSync } from 'node:fs';
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

  // The start (a dialog in the middle, as in the concept): who sits at the table. The one signed in is
  // ticked under «Frå Vardahei».
  await page.getByRole('button', { name: 'Start samtale' }).click();
  const start = page.getByRole('dialog', { name: 'Start samtale med Syntetisk admin kunde' });
  await expect(start.getByText(/· 27 spørsmål$/)).toBeVisible();
  await expect(
    start.getByRole('group', { name: 'Frå Vardahei' }).getByRole('checkbox').first(),
  ).toBeChecked();
  await start.getByLabel('Namn (valfritt)').fill('Kari Nordmann');
  await start.getByRole('button', { name: 'Start samtalen' }).click();
  await expect(
    page.getByRole('heading', { name: 'Syntetisk admin kunde', level: 1 }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.locator('.sm-q')).toContainText('ansvaret for IT');
  // Focus mode: no menu and no top line; the bar leads back to «Samtalar».
  await expect(page.locator('#sidemeny')).toHaveCount(0);
  await expect(page.locator('.topplinje')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Samtalar' })).toBeVisible();

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

  // «Endre» in the bar corrects who is at the table, until the conversation is finished; what was
  // typed stays, and the focus comes back to «Endre».
  const endre = page.getByRole('button', { name: 'Endre kven som er med og dato' });
  await endre.click();
  const fix = page.getByRole('dialog', { name: 'Endre samtalen med Syntetisk admin kunde' });
  await expect(fix.getByLabel('Namn (valfritt)')).toHaveValue('Kari Nordmann');
  await fix.getByRole('button', { name: 'Legg til person' }).click();
  await fix.getByLabel('Rolle, person 2').fill('økonomi');
  await fix.getByRole('button', { name: 'Lagre' }).click();
  await expect(fix).toHaveCount(0);
  await expect(endre).toBeFocused();
  await expect(page.locator('.sm-kven p')).toContainText('Kari Nordmann, dagleg leiar · økonomi');
  await expect(page.getByLabel('Kva seier kunden?')).toHaveValue(
    'Ingen definert ansvarleg, men det går naturleg til dagleg leiar.',
  );
  await expect(page.getByLabel('Eige notat')).toHaveValue('Kandidat for beredskapspakken.');
  const people = (await (await page.request.get(`/api/admin/interviews/${id}`)).json()) as {
    interviewees: unknown;
    answers: Record<string, { answer: string }>;
  };
  expect(people.interviewees).toEqual([
    { role: 'dagleg leiar', name: 'Kari Nordmann' },
    { role: 'økonomi' },
  ]);
  expect(people.answers.N2?.answer).toBe(
    'Ingen definert ansvarleg, men det går naturleg til dagleg leiar.',
  );

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
  await expect(page.getByText(/Samtalen er no med i oversikta og på kundesida/)).toBeVisible();
  await expect(page.getByLabel('Samla inntrykk')).toHaveJSProperty('readOnly', true);
  const done = (await (await page.request.get(`/api/admin/interviews/${id}`)).json()) as {
    status: string;
    summary: string;
  };
  expect(done).toMatchObject({ status: 'done', summary: 'God merksemd i leiinga.' });

  // 2.21: the referat has what the client said and the conclusion, never the own note.
  await page.getByRole('link', { name: 'Sjå referatet' }).click();
  await expect(page.getByRole('heading', { name: 'Referat', level: 1 })).toBeVisible();
  const sheets = page.locator('article.sm-ark');
  await expect(sheets).toHaveCount(2);
  await expect(sheets.first()).toContainText('Peik ut ein IT-ansvarleg og ein stadfortredar.');
  await expect(sheets.first()).toContainText('God merksemd i leiinga.');
  await expect(sheets.last()).toContainText('Skrive medan nettet var borte.');
  await expect(sheets.last()).toContainText('Eigne notat frå Vardahei er ikkje med.');
  await expect(page.getByText('Kandidat for beredskapspakken.')).toHaveCount(0);
  await expect(page.getByText(/^Utkast:/)).toHaveCount(0);

  // Oversikt shows the finished conversation; its CSV has the answer and not the note.
  await page.getByRole('link', { name: 'Oppsummering' }).click();
  await page.getByRole('link', { name: 'Til oversikta' }).click();
  await expect(
    page.getByRole('heading', { name: 'Oversikt over samtalane', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'Syntetisk admin kunde, 1 Kven har IT-ansvaret: forbetringspotensial',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('table').getByRole('link', { name: 'Syntetisk admin kunde' }),
  ).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Eksporter CSV' }).click(),
  ]);
  const csv = readFileSync(await download.path(), 'utf8');
  expect(csv).toContain('Skrive medan nettet var borte.');
  expect(csv).toContain('Peik ut ein IT-ansvarleg og ein stadfortredar.');
  expect(csv).not.toContain('Kandidat for beredskapspakken.');

  // The client page lists the conversation, with the way to its referat.
  await page.goto(`/admin/clients/${s.client}`);
  const block = page.getByRole('region', { name: 'Samtalar' });
  await expect(block.getByText(`Haust ${s.mark}`)).toBeVisible();
  await expect(block.getByText(/Fullført/)).toBeVisible();
  await block.getByRole('link', { name: `Referat, Haust ${s.mark}` }).click();
  await expect(page.locator('article.sm-ark').first()).toContainText('Syntetisk admin kunde');
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

test('the wrong client is corrected in «Endre»; a session that ran out comes back to the same question', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await login(page);
  const s = await state(page);
  const guide = await publishedGuide(page, `Samtaleguide flytt ${s.mark}`);
  const made = await page.request.post('/api/admin/interview-rounds', {
    data: {
      name: `Flytt ${s.mark}`,
      template_version_id: guide,
      clients: [s.client, s.other_client],
    },
  });
  expect(made.status()).toBe(201);
  const round = ((await made.json()) as { id: string }).id;
  const view = (await (await page.request.get(`/api/admin/interview-rounds/${round}`)).json()) as {
    interviews: { id: string; client: { id: string } }[];
  };
  const id = view.interviews.find((i) => i.client.id === s.client)!.id;
  expect(
    (
      await page.request.post(`/api/admin/interviews/${id}/start`, {
        data: {
          held_on: '2026-11-10',
          interviewees: [{ role: 'dagleg leiar' }],
          interviewers: ['Asbjørn'],
        },
      })
    ).ok(),
  ).toBe(true);

  // Typed at the wrong client's table.
  await page.goto(`/admin/samtalar/${id}?q=N5`);
  const answer = page.getByLabel('Kva seier kunden?');
  await answer.fill('Berre Dropbox.');
  await expect(saved(page)).toBeVisible();

  // «Endre»: says what a move does, and takes everything along.
  await page.getByRole('button', { name: 'Endre kven som er med og dato' }).click();
  const fix = page.getByRole('dialog');
  const client = fix.getByRole('combobox', { name: 'Kunde', exact: true });
  await expect(client).toHaveValue(s.client);
  await client.selectOption({ label: 'Syntetisk andre kunde' });
  await expect(fix.getByRole('status')).toContainText('blir flytta til Syntetisk andre kunde');
  await fix.getByRole('button', { name: 'Lagre' }).click();
  await expect(fix).toBeHidden();
  await expect(page.locator('.sm-topp')).toContainText('Syntetisk andre kunde');
  await expect(answer).toHaveValue('Berre Dropbox.');

  // The list agrees: the right client is going on, the wrong one waits.
  await page.goto(`/admin/samtalar?runde=${round}`);
  const group = (name: RegExp) =>
    page.locator('.sm-gruppekort').filter({ has: page.getByRole('heading', { name }) });
  await expect(group(/^Pågår/)).toContainText('Syntetisk andre kunde');
  await expect(group(/^Ikkje starta/)).toContainText('Syntetisk admin kunde');

  // On the client page the block of conversations comes first, as in the concept.
  await page.goto(`/admin/clients/${s.other_client}`);
  await expect(page.locator('.rom-side').first().locator('section.kort h2').first()).toHaveText(
    'Samtalar',
  );

  // The session runs out in the middle of a sentence: nothing is lost, and signing in comes back here.
  await page.goto(`/admin/samtalar/${id}?q=N5`);
  await expect(answer).toHaveValue('Berre Dropbox.');
  await context.clearCookies();
  await answer.fill('Berre Dropbox og Teams.');
  const out = page.getByRole('alert').filter({ hasText: 'Du er logga ut' });
  await expect(out).toBeVisible();
  await out.getByRole('link', { name: 'Logg inn igjen' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/samtalar/${id}\\?q=N5$`));
  await expect(answer).toHaveValue('Berre Dropbox og Teams.');
  await expect(saved(page)).toBeVisible();
  const back = (await (await page.request.get(`/api/admin/interviews/${id}`)).json()) as {
    answers: Record<string, { answer: string }>;
  };
  expect(back.answers.N5!.answer).toBe('Berre Dropbox og Teams.');
});

test('a repeat conversation: criteria under the buttons, last time under the question, before and after', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  const s = await state(page);
  const guide = await publishedGuide(page, `Samtaleguide gjenteke ${s.mark}`);
  const api = async (url: string, data?: object) => {
    const r = await page.request.post(url, data === undefined ? {} : { data });
    expect(r.ok(), `${url}: ${await r.text()}`).toBe(true);
    return r.json() as Promise<{ id: string }>;
  };
  const conversation = async (name: string, held_on: string) => {
    const round = await api('/api/admin/interview-rounds', {
      name: `${name} ${s.mark}`,
      template_version_id: guide,
      clients: [s.client],
    });
    const view = (await (
      await page.request.get(`/api/admin/interview-rounds/${round.id}`)
    ).json()) as { interviews: { id: string }[] };
    const id = view.interviews[0]!.id;
    await api(`/api/admin/interviews/${id}/start`, {
      held_on,
      interviewees: [{ role: 'dagleg leiar' }],
    });
    return id;
  };
  const put = async (id: string, q: string, data: object) =>
    expect(
      (await page.request.put(`/api/admin/interviews/${id}/answers/${q}`, { data })).ok(),
    ).toBe(true);
  // In spring: N2 Forbetringspotensial with what was said and the conclusion, N3 Manglar; finished.
  const spring = await conversation('Gjenteke vår', '2026-05-04');
  await put(spring, 'N2', { field: 'rating', value: 'forbetring', expect: null });
  await put(spring, 'N2', { field: 'answer', value: 'Dagleg leiar tek det.', expect: '' });
  await put(spring, 'N2', { field: 'action', value: 'Peik ut ein ansvarleg.', expect: '' });
  await put(spring, 'N3', { field: 'rating', value: 'manglar', expect: null });
  await api(`/api/admin/interviews/${spring}/done`);

  // In autumn: each button says when it applies; its name stays the word.
  const autumn = await conversation('Gjenteke haust', '2026-11-10');
  await page.goto(`/admin/samtalar/${autumn}`);
  const ivaretatt = page.getByRole('radio', { name: 'Ivaretatt', exact: true });
  await expect(ivaretatt).toContainText(
    'Éin namngitt ansvarleg med stadfortredar, og dei tilsette veit kven det er.',
  );
  await expect(ivaretatt).toHaveAccessibleDescription(
    'Éin namngitt ansvarleg med stadfortredar, og dei tilsette veit kven det er.',
  );
  await expect(page.getByRole('radio', { name: 'Manglar', exact: true })).toContainText(
    'Ingen har ansvaret, eller ingen veit kven som har det.',
  );
  // Last time's rating under the question; what the client said then opens under it.
  const before = page.locator('.sm-forre');
  await expect(before.locator('summary')).toHaveText(
    /^Førre gong \(04\.05\.2026\):.*Forbetringspotensial$/,
  );
  await expect(page.getByText('Dagleg leiar tek det.')).toBeHidden();
  await before.locator('summary').click();
  await expect(page.getByText('Dagleg leiar tek det.')).toBeVisible();
  await expect(page.getByText('Peik ut ein ansvarleg.')).toBeVisible();
  await page.keyboard.press('Alt+Digit1');
  await expect(ivaretatt).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('.sm-forre')).toHaveText(/^Førre gong \(04\.05\.2026\):.*Manglar$/);
  await page.keyboard.press('Alt+Digit2');
  await expect(
    page.getByRole('radio', { name: 'Forbetringspotensial', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('.sm-q')).toContainText('privat e-post');
  await expect(page.locator('.sm-forre')).toHaveCount(0);
  await expect(saved(page)).toBeVisible();

  // The summary: then and now, and both questions that went up the scale.
  await page.getByRole('link', { name: 'Oppsummering' }).click();
  const card = page.getByRole('region', { name: 'Før og etter' });
  await expect(card).toContainText('Samanlikna med samtalen 04.05.2026');
  await expect(card.getByRole('row', { name: /^Poeng/ })).toContainText('25');
  await expect(card.getByRole('heading', { name: 'Betre 2' })).toBeVisible();
  await expect(card.getByRole('listitem')).toHaveText([
    /^1Kven har IT-ansvaret.*frå Forbetringspotensial til Ivaretatt$/,
    /^2Informasjon om endringar.*frå Manglar til Forbetringspotensial$/,
  ]);
  await page.getByLabel('Vis for kunden').check();
  await expect(card.getByRole('row', { name: /^Poeng/ })).toHaveCount(0);
  await page.getByLabel('Vis for kunden').uncheck();
  await page.getByRole('button', { name: 'Fullfør samtalen' }).first().click();
  // The done callout of 2.21 (the concept): saved, with the ways to the referat and Oversikt.
  await expect(page.getByText(/^Fullført og lagra /)).toBeVisible();

  // The client page: one line for the latest two.
  await page.goto(`/admin/clients/${s.client}`);
  const line = page.getByRole('region', { name: 'Samtalar' }).locator('.sm-kunde-fe');
  await expect(line).toContainText('04.05.2026');
  await expect(line).toContainText('10.11.2026');
  await expect(line).toContainText('2 betre');
  await expect(line).toContainText('0 verre');
});
