// 2.22b end to end: actions of the catalogue in «Samtalar» (decision 3.3 of 07.11). Two actions are made in
// the catalogue on «Funn-reglar»; in a conversation one is found by its seminar topic and taken with the
// keyboard, the other with a click; the choice is saved like the other fields and survives a reload; the
// summary names them; a finished conversation shows them read only. Oversikt groups the recurring tiltak
// by action with its seminar topic; the referat names them beside the conclusion; the client page lists
// them under «Funn» and changes their status with the control of the findings.
import { expect, test, type Page } from '@playwright/test';
import { login, state } from './support.js';

const saved = (page: Page) =>
  page.locator('.sm-topp .sm-lagra').filter({ hasText: /^(Lagra \d|Alt er lagra)/ });

async function api<T>(page: Page, method: 'get' | 'post' | 'put', url: string, data?: unknown) {
  const r = await page.request[method](url, data === undefined ? {} : { data });
  expect(r.ok(), `${method} ${url}: ${await r.text()}`).toBe(true);
  return (await r.json()) as T;
}

async function publishedGuide(page: Page, title: string) {
  const { id } = await api<{ id: string }>(page, 'post', '/api/admin/surveys', {
    title,
    audience: 'interview',
    identification: 'none',
    required_languages: ['nn'],
  });
  const hash = async () =>
    (await api<{ content_hash: string }>(page, 'get', `/api/admin/surveys/versions/${id}`))
      .content_hash;
  await api(page, 'post', `/api/admin/surveys/versions/${id}/accept`, {
    content_hash: await hash(),
    lang: 'nn',
  });
  await api(page, 'post', `/api/admin/surveys/versions/${id}/publish`, {
    content_hash: await hash(),
    confirmed: true,
  });
  return id;
}

test('an action of the catalogue chosen in a conversation shows in Oversikt, the referat and on the client page', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await login(page);
  const s = await state(page);
  const phishing = `Phishing-øving ${s.mark}`;
  const passord = `Passordhandterar ${s.mark}`;

  // The catalogue on «Funn-reglar»: «Nytt tiltak» with a name, what it is and the seminar topic.
  await page.goto('/admin/surveys/funn');
  const katalog = page.getByRole('region', { name: 'Tiltakskatalog' });
  for (const [name, what, topic] of [
    [phishing, 'Ei øving med falske e-postar for alle tilsette.', 'Phishing og svindel'],
    [passord, 'Bitwarden for heile bedrifta, med opplæring.', 'Passord som fungerer'],
  ]) {
    await katalog.getByRole('button', { name: 'Nytt tiltak' }).click();
    await katalog.getByLabel('Namn').fill(name);
    await katalog.getByLabel('Kva går tiltaket ut på?').fill(what);
    await katalog.getByLabel('Seminartema').fill(topic);
    await katalog.getByRole('button', { name: 'Lagre tiltaket' }).click();
    await expect(katalog.getByText(name, { exact: true })).toBeVisible();
  }

  // A client of its own, a round and a conversation started.
  const guide = await publishedGuide(page, `Kartlegging nøkkelpersonar ${s.mark}`);
  const client = (
    await api<{ id: string }>(page, 'post', '/api/admin/clients', {
      // No «til» in the name: the seminar specs find the form's «Til» by label, and clients are boxes there.
      name: `Fjordbu Elektro ${s.mark}`,
      employee_count: 12,
    })
  ).id;
  const round = (
    await api<{ id: string }>(page, 'post', '/api/admin/interview-rounds', {
      name: `Katalogrunde ${s.mark}`,
      template_version_id: guide,
      clients: [client],
    })
  ).id;
  const id = (
    await api<{ interviews: { id: string }[] }>(page, 'get', `/api/admin/interview-rounds/${round}`)
  ).interviews[0]!.id;
  await api(page, 'post', `/api/admin/interviews/${id}/start`, {
    held_on: '2026-11-10',
    interviewees: [{ role: 'dagleg leiar' }],
    interviewers: ['Asbjørn'],
  });

  // Question 1: the conclusion, Manglar, and two actions of the catalogue.
  await page.goto(`/admin/samtalar/${id}`);
  await expect(page.locator('.sm-q')).toContainText('ansvaret for IT');
  await page.getByLabel('Konklusjon og tiltak').fill('Peik ut ein IT-ansvarleg.');
  await page.keyboard.press('Alt+Digit3');
  const tiltak = page.getByRole('group', { name: 'Tiltak frå katalogen' });
  const add = tiltak.getByRole('button', { name: 'Legg til frå katalogen' });
  await add.click();
  await expect(add).toHaveAttribute('aria-expanded', 'true');
  const search = tiltak.getByRole('combobox', { name: 'Søk i katalogen' });
  await expect(search).toBeFocused();
  // Found by a word of its seminar topic (and the mark of this run), taken with Enter.
  await search.fill(`svindel ${s.mark}`);
  await expect(tiltak.getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(tiltak.getByRole('option', { name: new RegExp(phishing) })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The other with a click; Escape gives the focus back to «Legg til».
  await search.fill(passord);
  await tiltak.getByRole('option', { name: new RegExp(passord) }).click();
  await search.press('Escape');
  await expect(tiltak.getByRole('listbox')).toHaveCount(0);
  await expect(add).toBeFocused();
  const chips = tiltak.getByRole('list', { name: 'Valde tiltak' }).getByRole('listitem');
  await expect(chips).toHaveText([passord, phishing].sort((a, b) => a.localeCompare(b, 'nn')));
  await expect(saved(page)).toBeVisible();
  const catalog = await api<{ id: string; name: string }[]>(page, 'get', '/api/admin/actions');
  const ids = catalog
    .filter((a) => [phishing, passord].includes(a.name))
    .map((a) => a.id)
    .sort();
  const v = await api<{ answers: Record<string, { actions: string; rating: string }> }>(
    page,
    'get',
    `/api/admin/interviews/${id}`,
  );
  expect(v.answers.N2).toMatchObject({ actions: ids.join(','), rating: 'manglar' });

  // A reload keeps the choice; the summary names it beside the conclusion; «Fullfør» locks it.
  await page.reload();
  await expect(chips).toHaveCount(2);
  await page.getByRole('link', { name: 'Oppsummering' }).click();
  const point = page.locator('.sm-sjaa .sm-punkt').first();
  await expect(point).toContainText('Peik ut ein IT-ansvarleg.');
  await expect(point).toContainText(passord);
  await page.getByRole('button', { name: 'Fullfør samtalen' }).first().click();
  await expect(page.getByText(/Samtalen er no med i oversikta og på kundesida/)).toBeVisible();
  await page.goto(`/admin/samtalar/${id}?q=N2`);
  await expect(chips).toHaveCount(2);
  await expect(tiltak.getByRole('button')).toHaveCount(0);

  // Oversikt: the recurring tiltak by action, with the seminar topic as the chip.
  await page.goto(`/admin/samtalar/oversikt?runde=${round}`);
  const igjen = page.getByRole('region', { name: 'Tiltak som går igjen' });
  await expect(igjen.getByRole('heading', { name: 'Frå katalogen' })).toBeVisible();
  const row = igjen.getByRole('listitem').filter({ hasText: phishing });
  await expect(row).toContainText('1av 1 kunde');
  await expect(row).toContainText('Spørsmål 1 · ');
  await expect(row.locator('.sm-tiltak-tema')).toHaveText('Seminartema: Phishing og svindel');

  // The referat names the actions beside the conclusion.
  await page.goto(`/admin/samtalar/${id}/referat`);
  const sheet = page.locator('article.sm-ark').first();
  await expect(sheet).toContainText('Peik ut ein IT-ansvarleg.');
  await expect(sheet.locator('.sm-ark-katalog')).toContainText(phishing);

  // The client page: under «Funn» the actions of the conversation, with the status of findings.
  await page.goto(`/admin/clients/${client}`);
  const funn = page.getByRole('region', { name: 'Funn' });
  const fra = funn.getByRole('region', { name: 'Tiltak frå samtalane' });
  await expect(fra.locator('.kst-namn')).toHaveText(
    [passord, phishing].sort((a, b) => a.localeCompare(b, 'nn')),
  );
  await fra
    .getByRole('button', { name: `Endre status for tiltaket: ${phishing} (spørsmål 1)` })
    .click();
  await fra
    .getByLabel(`Status for tiltaket: ${phishing} (spørsmål 1)`, { exact: true })
    .selectOption('closed');
  await fra.getByRole('button', { name: 'Lagre' }).click();
  await expect(page.getByText('Status for tiltaket er lagra.')).toBeVisible();
  await expect(fra.locator('details summary')).toHaveText('Ferdige (1)');
  const rows = await api<{ rows: { action: { name: string }; status: string }[] }>(
    page,
    'get',
    `/api/admin/clients/${client}/interview-actions`,
  );
  expect(rows.rows.find((r) => r.action.name === phishing)?.status).toBe('closed');
  expect(rows.rows.find((r) => r.action.name === passord)?.status).toBe('open');
});
