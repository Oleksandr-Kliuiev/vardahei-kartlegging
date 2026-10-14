import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Answers } from '@varde/rules/runner';
import notice from '../src/i18n/notice-v2.nn.json' with { type: 'json' };
import { contentFor, draftAt } from './submission-support.js';
import { state } from './support.js';

test('identified intro shows approved who_sees notice, letter and sender', async ({ page }) => {
  await page.goto(`/r?c=${state().nn.code}`);
  await expect(page.getByText(notice['notice.identified.who_sees'])).toBeVisible();
  await expect(page.getByText(notice['notice.anonymous.intro'])).toHaveCount(0);
  await expect(page.locator('.brev .helsing')).toContainText(contentFor('nn').intro.sender.nn);
});
test('anonymous intro uses anonymous notice without the obsolete initials promise', async ({
  page,
}) => {
  await page.goto(`/r?c=${state().anonymous.code}`);
  await expect(page.getByText(notice['notice.anonymous.intro'])).toBeVisible();
  await expect(page.getByText(notice['notice.identified.intro'])).toHaveCount(0);
  await expect(
    page.getByText(
      'Svara per person ser berre Vardahei IT. Bedrifta får eit samla bilete utan initialar.',
    ),
  ).toHaveCount(0);
});
test('identifier is mandatory, uppercase and at most eight characters', async ({ page }) => {
  await page.goto(`/r?c=${state().nn.code}`);
  await page.locator('#start').click();
  await expect(page.locator('#vidare')).toBeDisabled();
  await page.locator('#tekst-K0').fill('abcdefghijk');
  await expect(page.locator('#tekst-K0')).toHaveValue('ABCDEFGH');
});
const golden = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../tools/parity/golden/paths.json'), 'utf8'),
) as {
  scenarios: { id: string; survey: string; answers: Answers; tips: string[] }[];
};
for (const s of golden.scenarios.filter((s) => s.survey === 'ki'))
  test(`KI finish advice equals old runner: ${s.id}`, async ({ page }) => {
    const answers = { ...s.answers };
    for (const q of contentFor('nn').questions)
      if (q.type === 'scale') {
        const v = answers[q.id];
        if (
          !v ||
          typeof v !== 'object' ||
          Array.isArray(v) ||
          q.rows.some((r) => v[r.id] === undefined)
        )
          delete answers[q.id];
      }
    await draftAt(page, 'nn', answers, 'review');
    await page.locator('#send').click();
    await expect(page.locator('.slutt')).toBeVisible();
    expect(
      await page
        .locator('[data-tip]')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-tip'))),
    ).toEqual(s.tips);
    const q = contentFor('nn').questions.find((q) => q.id === 'K21');
    if (q && 'scenario' in q && q.scenario)
      await expect(page.locator('[data-scenario="K21"]')).toContainText(
        q.scenario.explanation.text.nn,
      );
  });
test('security finish contains no advice or scenarios and shows contact', async ({ page }) => {
  await draftAt(page, 'security', { F1: 'ZZTEST', F2: 'kontor' }, 'review');
  await page.locator('#send').click();
  await expect(page.locator('.slutt')).toBeVisible();
  await expect(page.locator('[data-tip], [data-scenario], [data-section="tips"]')).toHaveCount(0);
  await expect(page.locator('.kontakt')).toContainText(contentFor('security').intro.contact.phone);
});
