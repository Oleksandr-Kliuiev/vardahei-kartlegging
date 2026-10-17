// Round archive (5.2): «Last ned arkiv» only for a closed round; the file is the JSON archive
// of aggregates and definitions, without initials, answers or leader free text.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { login, personvern, state } from './support.js';

test('closed round: «Last ned arkiv» downloads the aggregate archive; open round: no button', async ({
  page,
}) => {
  await login(page);
  const s = await state(page);
  await personvern(page, 'Eksport');
  await page.getByLabel('Runde', { exact: true }).selectOption(s.rounds.dashboard!.id);
  await expect(page.getByRole('link', { name: 'Master_Analyse', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Last ned arkiv' })).toHaveCount(0);
  const f = s.rounds.report!;
  await page.getByLabel('Runde', { exact: true }).selectOption(f.id);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Last ned arkiv' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`varde-arkiv-${f.id}.json`);
  const text = readFileSync(await file.path(), 'utf8');
  const archive = JSON.parse(text) as { format: string; round: { id: string }; sha256: string };
  expect(archive).toMatchObject({ format: 'varde.round-archive', round: { id: f.id } });
  expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/);
  for (const secret of ['ZZRAP', 'ZZLEIARTEKST', '"respondent_key"', '"answers"'])
    expect(text).not.toContain(secret);
});
