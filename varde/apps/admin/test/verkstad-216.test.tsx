// 2.16 in the workshop: empty texts stop publishing, «Omsetjing» shows and writes every text, an
// approval says who and what changed since, and «Versjonar» shows what changed between versions.
import { act } from 'react';
import { expect, it } from 'vitest';
import { respondentTexts } from '../../../packages/schema/src/template/respondent-texts.js';
import { settle } from './support.js';
import {
  $,
  byText,
  open,
  serve,
  trail,
  type,
  versions,
  wait,
  workshopTests,
} from './verkstad-support.js';

workshopTests();
const publishing = (div: HTMLElement) =>
  act(() =>
    [...div.querySelectorAll('button')]
      .find((b) => b.textContent?.startsWith('Gjer klar til publisering'))!
      .click(),
  );

it('an empty question stops publishing and «Gå til» leads to it', async () => {
  const store = versions();
  store['version']!.content.questions[2]!.texts.text = { nn: '', en: '' };
  serve(store);
  const div = await open();
  publishing(div);
  const item = [...div.querySelectorAll('.vk-skuff li')].find((li) =>
    li.textContent?.includes('Teksten er tom. (Q3: spørsmålet)'),
  )!;
  expect(div.querySelector('.vk-skuff')!.textContent).toContain('1 ting må fiksast');
  act(() => byText(item as HTMLElement, 'Gå til').click());
  expect(div.querySelector('.vk-skuff')).toBeNull();
  expect($(div, '[aria-current="true"][data-sel]').getAttribute('data-sel')).toBe('Q3');
  expect(trail(div)).toEqual(['F1', 'R', 'Q3']);
});

it('«Omsetjing» lists every text, «Manglar» filters, and a translation typed there is saved', async () => {
  const store = versions();
  store['version']!.content.questions[2]!.texts.text.en = '';
  const api = serve(store);
  const div = await open();
  act(() => byText(div, 'Omsetjing').click());
  expect(div.querySelector('.vk-omsetjing')).not.toBeNull();
  expect(div.querySelector('.vk-flate')).toBeNull();
  act(() => byText(div, 'Manglar 1').click());
  const rows = div.querySelectorAll('.vk-oms-rad:not(.vk-oms-hovud)');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.textContent).toContain('Q3: spørsmålet');
  type(
    $<HTMLTextAreaElement>(div, '[aria-label="Q3: spørsmålet, English"]'),
    'Do you take backups?',
  );
  await wait(800);
  expect(api.puts().at(-1)!.body.content!.questions[2]!.texts.text.en).toBe('Do you take backups?');
  act(() => byText(div, 'Tilbake til skjemaet').click());
  expect(div.querySelector('.vk-flate')).not.toBeNull();
});

it('an approval says who and when, and what changed after it', async () => {
  const store = versions();
  const draft = store['version']!;
  const snapshot = Object.fromEntries(
    respondentTexts(draft.content).map((r) => [r.key, { nn: r.text.nn, en: r.text.en ?? '' }]),
  );
  snapshot['q.Q3.text'] = { nn: 'Tek de backup?', en: 'Old words' };
  draft.acceptance_basis = { en: { at: '2026-10-17T10:00:00.000Z', by: 'oid-1', texts: snapshot } };
  draft.people = { 'oid-1': 'Syntetisk Admin' };
  serve(store);
  const div = await open();
  publishing(div);
  const panel = $(div, '.vk-skuff').textContent;
  expect(panel).toContain('1 tekst er endra etter at Syntetisk Admin godkjende');
  expect(panel).toContain('Q3: spørsmålet');
  act(() => byText(div, 'Sjå dei i Omsetjing').click());
  expect(byText(div, 'Endra etter godkjenning 1')).toBeTruthy();
  act(() => byText(div, 'Endra etter godkjenning 1').click());
  expect(div.querySelectorAll('.vk-oms-rad:not(.vk-oms-hovud)')).toHaveLength(1);
  expect($(div, '.vk-oms-status').textContent).toContain(
    '1 tekst er endra etter at Syntetisk Admin',
  );
});

it('«Versjonar» lists the versions and what changed from the one before', async () => {
  const store = versions();
  store['version']!.content.questions[2]!.texts.text.nn = 'Tek de backup kvar veke?';
  serve(store);
  const div = await open();
  act(() => $(div, '.vk-tittel .vk-chipknapp').click());
  const panel = $(div, '.vk-versjonar');
  expect(panel.textContent).toContain('Utkast v2');
  expect(panel.textContent).toContain('Publisert v1');
  expect(panel.textContent).toContain('Opna no');
  act(() => byText(panel, 'Kva endra seg frå v1?').click());
  await settle();
  expect($(div, '.vk-endringar').textContent).toContain('Endra Q3 «Tek de backup kvar veke?»');
});
