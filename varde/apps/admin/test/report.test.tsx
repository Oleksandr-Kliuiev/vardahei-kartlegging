// Client report in the admin (5.1): the A4 sheet shows hidden numbers as «–», the PDF button
// needs the human check, a new language or client resets it, and the round card links to the
// report only for a closed round with released snapshots.
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findBokmal } from '../../../packages/schema/src/i18n/nn-stoplist.js';
import { ReportPage } from '../src/report-page.js';
import { ReportSheet } from '../src/report-sheet.js';
import { type ClientReport, TEXTS } from '../src/report-texts.js';
import { RoundClientCard } from '../src/round-client.js';
import { button, mount, settle } from './support.js';

let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

const stats = (mean: number | null, critical: number | null, zone: number | null) => ({
  mean,
  critical,
  zone,
});
const report = (lang: 'nn' | 'en' = 'nn'): ClientReport => ({
  class: 'aggregate',
  round_client: 'rc-1',
  round: {
    id: 'r',
    name: 'Syntetisk runde',
    type: 'regular',
    opened: '2026-10-01',
    closed: '2026-10-14',
  },
  client: { name: 'Syntetisk kunde' },
  template: 'tryggleik',
  lang,
  languages: ['nn', 'en'],
  generated: '2026-10-16',
  respondents: 12,
  zone: stats(1.23, 0.31, 1),
  findings: [
    {
      key: 'tryggleik.f14',
      level: 'high',
      severity: 'risk',
      lang,
      tal: lang === 'en' ? '5 of 12' : '5 av 12',
      text: lang === 'en' ? 'do not use MFA' : 'brukar ikkje MFA',
      action: lang === 'en' ? 'Turn on MFA.' : 'Slå på MFA.',
    },
  ],
  questions: [
    { id: 'F3', label: 'Fokus på sikkerheit', ...stats(0.94, 0.25, 1), before: stats(0.8, 0.2, 1) },
    { id: 'F4', label: 'Opplevd svindelforsøk', ...stats(null, null, null), before: null },
  ],
  comparison: {
    round: { name: 'Runde 1 (Forms, januar 2026)', type: 'external_import' },
    degree: 'comparable',
    before: { ...stats(1.06, 0.27, 1), respondents: 10 },
    now: { ...stats(1.23, 0.31, 1), respondents: 12 },
    change: { mean: { delta: 0.17, kind: 'verre' }, critical: { delta: 4, kind: 'verre' } },
  },
});

describe('A4 sheet', () => {
  it('words with every zone colour, «–» for hidden cells, no controls on the paper', () => {
    view = mount(<ReportSheet report={report()} />);
    const text = view.div.textContent ?? '';
    expect(text).toContain('IT-tryggleik hos');
    expect(text).toContain('Syntetisk kunde');
    expect(text).toContain('Laga 16. oktober 2026');
    expect(text).toContain('Syntetisk runde · 1.–14. oktober 2026');
    expect(text).toContain('1,23');
    expect(text).toContain('31 %');
    expect(text).toContain('5 av 12');
    expect(text).toContain('Samanlikna med Runde 1 (Forms, januar 2026)');
    expect(text).toContain('+0,17, verre');
    expect(text).toContain('+4 prosentpoeng, verre');
    expect(text).toMatch(/omtrentleg/);
    const hiddenRow = [...view.div.querySelectorAll('tbody tr')].find((r) =>
      r.textContent?.startsWith('Opplevd svindelforsøk'),
    )!;
    expect([...hiddenRow.querySelectorAll('td')].map((td) => td.textContent)).toEqual([
      '–',
      '–',
      '–',
      '–',
    ]);
    for (const zone of view.div.querySelectorAll('.rapport-sone.gul'))
      expect(zone.textContent).toBe('Gul');
    expect(view.div.querySelectorAll('button, input, select, a')).toHaveLength(0);
    expect(view.div.querySelectorAll('.rapport-side')).toHaveLength(2);
  });
  it('English sheet and a client below k: no numbers at all', () => {
    const r = report('en');
    view = mount(
      <ReportSheet
        report={{
          ...r,
          respondents: null,
          zone: stats(null, null, null),
          findings: [],
          comparison: null,
        }}
      />,
    );
    const text = view.div.textContent ?? '';
    expect(text).toContain('IT security at');
    expect(text).toContain('Too few people answered');
    expect(text).toContain('We found no clear problems');
    expect(text).not.toMatch(/\d+ of \d+|What we suggest|Compared with/);
  });
  it('nynorsk texts have no bokmål forms', () => {
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') strings.push(v);
      else if (typeof v === 'function')
        strings.push(String((v as (...a: string[]) => string)('1', '2')));
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(TEXTS.nn);
    expect(strings.length).toBeGreaterThan(30);
    expect(strings.flatMap(findBokmal)).toEqual([]);
  });
});

describe('Rapportar page', () => {
  const rounds = [
    {
      id: 'r',
      name: 'Syntetisk runde',
      status: 'closed',
      template_version_id: 'v',
      round_clients: [
        {
          id: 'rc-1',
          client_id: 'c',
          client: { name: 'Syntetisk kunde' },
          status: 'closed',
          deadline: null,
          population_snapshot: 12,
          released: true,
        },
        {
          id: 'rc-2',
          client_id: 'd',
          client: { name: 'Utan tal' },
          status: 'closed',
          deadline: null,
          population_snapshot: 5,
          released: false,
        },
      ],
    },
    { id: 'o', name: 'Open runde', status: 'open', template_version_id: 'v', round_clients: [] },
  ];
  it('a person reads it before the PDF; language and client changes reset the check', async () => {
    const fetcher = vi.fn((path: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            path === '/api/admin/rounds' ? rounds : report(path.endsWith('lang=en') ? 'en' : 'nn'),
          ),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const print = vi.fn();
    vi.stubGlobal('print', print);
    view = mount(<ReportPage initial={undefined} />, true);
    await settle();
    const [roundSelect, clientSelect] = [...view.div.querySelectorAll('select')];
    expect([...roundSelect!.options].map((o) => o.text)).toEqual(['Syntetisk runde']);
    expect([...clientSelect!.options].map((o) => o.text)).toEqual(['Vel kunde', 'Syntetisk kunde']);
    expect(fetcher.mock.calls.some(([p]) => p.includes('/report'))).toBe(false);
    act(() => {
      clientSelect!.value = 'rc-1';
      clientSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(window.location.pathname).toBe('/admin/reports/rc-1');
    expect(fetcher).toHaveBeenCalledWith('/api/admin/round-clients/rc-1/report', expect.anything());
    expect(view.div.querySelector('.sjekk')?.textContent).toContain('Det viktigaste funnet');
    const save = button(view.div, 'Lagre som PDF');
    expect(save.disabled).toBe(true);
    const check = view.div.querySelector<HTMLInputElement>('.brytar input')!;
    act(() => {
      check.click();
    });
    expect(save.disabled).toBe(false);
    act(() => {
      save.click();
    });
    expect(print).toHaveBeenCalledTimes(1);
    act(() => {
      button(view!.div, 'English').click();
    });
    await settle();
    expect(fetcher).toHaveBeenCalledWith(
      '/api/admin/round-clients/rc-1/report?lang=en',
      expect.anything(),
    );
    expect(check.checked).toBe(false);
    expect(button(view.div, 'Lagre som PDF').disabled).toBe(true);
    expect(view.div.querySelector('.rapport-side')?.textContent).toContain('IT security at');
  });
});

describe('round client card', () => {
  const rc = {
    id: 'rc-1',
    client_id: 'c',
    client: { name: 'Syntetisk kunde' },
    status: 'closed',
    deadline: null,
    population_snapshot: 12,
    released: true,
  };
  it('links to the report only when the round is closed and released', () => {
    view = mount(<RoundClientCard rc={rc} reportReady />, true);
    const link = view.div.querySelector<HTMLAnchorElement>('a[href="/admin/reports/rc-1"]');
    expect(link?.textContent).toBe('Rapport til kunden');
    view.close();
    view = mount(<RoundClientCard rc={rc} />, true);
    expect(view.div.querySelector('a[href^="/admin/reports"]')).toBeNull();
  });
});
