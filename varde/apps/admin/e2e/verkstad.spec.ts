// The survey workshop (2.15): an edit saves itself and stays after a reload, the phone follows the trail
// and a condition, a save from another tab is never overwritten silently, and a changed frozen question
// publishes only with a choice that ends in the audit log.
import { expect, test, type Page } from '@playwright/test';
import type { Question } from '../../../packages/schema/src/template/question.js';
import { editorFixture } from '../test/editor-fixture.js';
import { login, menu, newSurvey, publish } from './support.js';

const t = (nn: string, en = nn) => ({ nn, en });
const yesNo = [
  { id: 'ja', texts: { text: t('Ja', 'Yes') } },
  { id: 'nei', texts: { text: t('Nei', 'No') } },
];
const role = editorFixture().content.questions[0]!;
const mfa = {
  id: 'Q2',
  type: 'single',
  part: 'common',
  texts: { text: t('Brukar du MFA?', 'Do you use MFA?') },
  options: yesNo,
} as Question;
const row = (page: Page, id: string) => page.locator(`.vk-sti [data-sel="${id}"]`);
const chosen = (page: Page) => page.locator('.vk-sti [aria-current="true"][data-sel]');
const saved = (page: Page) =>
  expect(page.locator('.vk-lagring')).toHaveText(/^Lagra kl\. \d\d\.\d\d$/);
// Full size: Playwright misplaces clicks inside the phone when it is drawn smaller with CSS zoom (1280 px).
test.use({ viewport: { width: 1440, height: 900 } });

test('an edit saves itself and stays after a reload; the phone follows the trail and a condition', async ({
  page,
}) => {
  await newSurvey(page, [role, mfa]);
  const phone = page.frameLocator('iframe[title="Førehandsvising på telefon"]');
  const at = phone.locator('[data-question-id]');
  const text = page.getByLabel('Spørsmålet', { exact: true });
  await row(page, 'Q2').click();
  await expect(at).toHaveAttribute('data-question-id', 'Q2');
  await text.fill('Brukar du tofaktor (MFA)?');
  await saved(page);
  await page.reload();
  await row(page, 'Q2').click();
  await expect(text).toHaveValue('Brukar du tofaktor (MFA)?');
  // A new question after Q2, shown only when Q2 is «Nei».
  await page
    .locator('.vk-seksjon.aktiv')
    .getByRole('button', { name: 'Spørsmål', exact: true })
    .click();
  await expect(chosen(page)).toHaveAttribute('data-sel', 'Q3');
  await text.fill('Kva hindrar deg?');
  await page.getByLabel('Svar 1', { exact: true }).fill('Det er tungvint');
  await page.getByLabel('Svar 2', { exact: true }).fill('Eg veit ikkje korleis');
  await page.getByRole('button', { name: 'Legg til vilkår' }).click();
  await page.getByLabel('Spørsmål i vilkår 1').selectOption('Q2');
  await page.getByLabel('Svar i vilkår 1').selectOption('nei');
  await expect(page.locator('.vk-setning').first()).toHaveText(
    'Blir berre vist når Q2 «Brukar du tofaktor (MFA)?» er «Nei».',
  );
  await saved(page);
  await expect(at).toHaveAttribute('data-question-id', 'Q3');
  await expect(phone.locator('.forhand-skjult')).toContainText('Blir berre vist når Q2');
  // «Ja» in the phone passes Q3 by; «Nei» leads to it. The trail follows the phone.
  await row(page, 'Q2').click();
  await expect(at).toHaveAttribute('data-question-id', 'Q2');
  await phone.locator('[data-id="ja"]').click();
  await expect(phone.locator('[data-question-id="Q2"]')).toHaveCount(0);
  await expect(phone.locator('[data-question-id="Q3"]')).toHaveCount(0);
  // A click on the chosen question brings the phone back to it.
  await row(page, 'Q2').click();
  await expect(at).toHaveAttribute('data-question-id', 'Q2');
  await phone.locator('[data-id="nei"]').click();
  await expect(at).toHaveAttribute('data-question-id', 'Q3');
  await expect(phone.locator('.forhand-skjult')).toHaveCount(0);
  await expect(chosen(page)).toHaveAttribute('data-sel', 'Q3');
  await page.reload();
  await row(page, 'Q3').click();
  await expect(page.locator('.vk-setning').first()).toContainText('er «Nei»');
  // A 1280 px laptop keeps the phone beside the question, a little smaller.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.vk-telefon .telefon')).toBeVisible();
  await row(page, 'Q2').click();
  await expect(at).toHaveAttribute('data-question-id', 'Q2');
});

test('a save from another tab is never overwritten silently, and what was typed here stays', async ({
  page,
  context,
}) => {
  const v = await newSurvey(page, [role, mfa]);
  const other = await context.newPage();
  await other.goto(`/admin/surveys/${v.id}`);
  await row(other, 'Q2').click();
  await other.getByLabel('Spørsmålet', { exact: true }).fill('Frå den andre fana');
  await saved(other);
  await row(page, 'Q2').click();
  const text = page.getByLabel('Spørsmålet', { exact: true });
  await text.fill('Frå denne fana');
  await expect(page.locator('.vk-feilmelding')).toContainText('endra ein annan stad');
  await expect(page.locator('.vk-lagring')).toHaveText('Ikkje lagra');
  await expect(text).toHaveValue('Frå denne fana');
  // One click on «Hent» only asks again; «Lagre mine over» saves this tab's text on purpose.
  await page.getByRole('button', { name: 'Hent det lagra utkastet' }).click();
  await expect(text).toHaveValue('Frå denne fana');
  await page.getByRole('button', { name: 'Lagre mine over' }).click();
  await saved(page);
  await expect(page.locator('.vk-feilmelding')).toHaveCount(0);
  await other.reload();
  await row(other, 'Q2').click();
  await expect(other.getByLabel('Spørsmålet', { exact: true })).toHaveValue('Frå denne fana');
});

test('a changed frozen question publishes only with a choice, and the choice is in the audit log', async ({
  page,
}) => {
  const frozen = {
    id: 'F1',
    type: 'single',
    part: 'common',
    frozen: true,
    anchor_key: 'F1',
    texts: { text: t('Brukar du MFA?', 'Do you use MFA?') },
    options: yesNo,
  } as Question;
  const v1 = await newSurvey(page, [frozen, role]);
  expect((await publish(page, v1.id)).status()).toBe(201);
  const made = await page.request.post(`/api/admin/surveys/${v1.template_id}/drafts`, {
    data: { label: 'v2', copy_from: v1.id },
  });
  const draft = (await made.json()) as { id: string };
  await page.goto(`/admin/surveys/${draft.id}`);
  const text = page.getByLabel('Spørsmålet', { exact: true });
  await row(page, 'F1').click();
  await expect(text).not.toBeEditable();
  await page.getByRole('button', { name: 'Rett ordlyden' }).click();
  await text.fill('Brukar du MFA (tofaktor)?');
  await expect(page.locator('.vk-klassifiser-tittel')).toHaveText(
    'Du har endra ordlyden i F1. Kva slags endring er det?',
  );
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.locator('textarea.vk-stor').fill('Do you use MFA (two-factor)?');
  await saved(page);
  // Without a choice the panel holds publishing back, and so does the server.
  await page.getByRole('button', { name: /Gjer klar til publisering/ }).click();
  const panel = page.locator('.vk-skuff');
  await expect(panel).toContainText('F1: vel kva slags endring');
  await panel.getByRole('button', { name: 'Eg har lese korrektur', exact: true }).click();
  await expect(panel.getByText(/^Godkjend /)).toHaveCount(1);
  await panel.getByRole('button', { name: 'Godkjenn English', exact: true }).click();
  await expect(panel.getByText(/^Godkjend /)).toHaveCount(2);
  const hold = panel.getByRole('button', { name: 'Hald inne for å publisere v2' });
  await expect(hold).toBeDisabled();
  const current = (await (
    await page.request.get(`/api/admin/surveys/versions/${draft.id}`)
  ).json()) as { content_hash: string };
  const refused = await page.request.post(`/api/admin/surveys/versions/${draft.id}/publish`, {
    data: { content_hash: current.content_hash, confirmed: true, frozen_changes: {} },
  });
  expect(refused.status()).toBe(400);
  await panel.getByRole('button', { name: 'Rettskriving', exact: true }).click();
  await expect(panel).toContainText('F1: rettskriving');
  await hold.click({ delay: 1400 });
  await expect(panel.getByText('v2 er publisert', { exact: true })).toBeVisible();
  const audit = (await (await page.request.get('/api/admin/audit?limit=40')).json()) as unknown[];
  expect(audit).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        what: 'surveys.frozen_change',
        target: `template_version:${draft.id}`,
      }),
    ]),
  );
});

test('a survey from a start is published without a line of JSON (2.16)', async ({ page }) => {
  await login(page);
  await menu(page, 'Skjema');
  await page.getByRole('button', { name: 'Nytt skjema', exact: true }).click();
  await page.getByLabel(/^Etter seminaret/).check();
  await page.getByLabel('Namn på skjemaet', { exact: true }).fill(`Etter seminaret ${Date.now()}`);
  await page.getByRole('button', { name: 'Lag skjemaet', exact: true }).click();
  await expect(page.locator('.vk-sti')).toBeVisible();
  // Only the first question of its own is left: its text and two answers.
  await expect(page.getByRole('button', { name: /Gjer klar til publisering/ })).toContainText('4');
  await row(page, 'Q2').click();
  await page.getByLabel('Spørsmålet', { exact: true }).fill('Kva tok du med deg frå seminaret?');
  await page.getByLabel('Svar 1', { exact: true }).fill('Mykje');
  await page.getByLabel('Svar 2', { exact: true }).fill('Lite');
  await saved(page);
  await page.getByRole('button', { name: /Gjer klar til publisering/ }).click();
  const panel = page.locator('.vk-skuff');
  await expect(panel).toContainText('Skjemaet er heilt');
  await panel.getByRole('button', { name: 'Eg har lese korrektur', exact: true }).click();
  await expect(panel.getByText(/^Godkjend av /)).toHaveCount(1);
  await panel.getByRole('button', { name: 'Hald inne for å publisere v1' }).click({ delay: 1400 });
  await expect(panel.getByText('v1 er publisert', { exact: true })).toBeVisible();
  // The next step is one click away: the wizard opens with this version chosen (2.17).
  await panel.getByRole('button', { name: 'Start ein runde med v1' }).click();
  await expect(page).toHaveURL(/\/admin\/rounds\?ny=[0-9a-f-]{36}$/);
  const version = new URL(page.url()).searchParams.get('ny')!;
  await expect(page.getByLabel('Versjon for den nye runden')).toHaveValue(version);
});
