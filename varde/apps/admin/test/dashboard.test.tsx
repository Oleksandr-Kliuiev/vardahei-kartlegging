import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DashboardRound, thresholdText } from '../src/dashboard-page.js';
import { Findings, KeyQuestions } from '../src/dashboard-aggregate.js';
import { EmployeeSection, QuotesSection } from '../src/dashboard-rows.js';
import type { Dashboard, Employees } from '../src/dashboard-models.js';
import { mount, settle } from './support.js';

let view: ReturnType<typeof mount> | undefined;
/** Opens the first folded block, as a click on its heading does. */
function openFold(div: HTMLElement) {
  const details = div.querySelector('details')!;
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
}
afterEach(() => {
  view?.close();
  vi.unstubAllGlobals();
});
const blank: Dashboard = {
  template: 'ki',
  mode: 'none',
  source: 'released',
  roles: [{ id: 'kontor', label: 'Administrasjon' }],
  suppression_note: 'Roller med færre enn 3 svar er ikkje viste.',
  findings: [],
  zones: null,
  key_questions: [],
  questions: [],
  ki: null,
};
it('separate short labels drive client/role queries; anonymous rounds never request employee rows', async () => {
  const get = vi.fn((path: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          path === '/api/admin/rounds'
            ? [
                {
                  id: 'synthetic',
                  name: 'Syntetisk runde',
                  status: 'closed',
                  round_clients: [{ client_id: 'client', client: { name: 'Syntetisk kunde' } }],
                },
              ]
            : path.startsWith('/api/admin/dashboard?')
              ? blank
              : path.includes('/quotes')
                ? { quotes: [] }
                : path.includes('/leader-answers')
                  ? { questions: [], findings: [], columns: [], rows: [], table: [] }
                  : null,
        ),
      ),
    ),
  );
  vi.stubGlobal('fetch', get);
  // The round is fixed by its page (2.17); client and role filter inside it.
  view = mount(
    <DashboardRound
      round="synthetic"
      clients={[{ client_id: 'client', client: { name: 'Syntetisk kunde' } }]}
    />,
    true,
  );
  await settle();
  await settle();
  const labels = [...view.div.querySelectorAll('label')];
  expect(labels.map((l) => l.textContent)).toEqual(['Kunde', 'Rolle']);
  expect(
    labels.every((l) => !l.querySelector('select') && !!document.getElementById(l.htmlFor)),
  ).toBe(true);
  const select = view.div.querySelector<HTMLSelectElement>('#dashboard-client')!;
  act(() => {
    select.value = 'client';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
  expect(
    get.mock.calls.some(([path]) => path === '/api/admin/dashboard?round=synthetic&client=client'),
  ).toBe(true);
  expect(get.mock.calls.some(([path]) => path.includes('/per-employee'))).toBe(false);
  expect(view.div.textContent).not.toContain('Svar per tilsett');
});
it('rings expose accessible critical shares while suppressed buckets remain dashes', () => {
  const cell = { suppressed: false as const, n: 4, numerator: 3, denominator: 4, missing: 0 };
  view = mount(
    <KeyQuestions
      questions={[
        {
          id: 'F12',
          label: 'Fullt spørsmål',
          short_label: 'Rapportering',
          type: 'single',
          mean: 1.5,
          critical: 0.75,
          zone: 1,
          n: 4,
          series: [
            {
              key: 'F12',
              label: 'Rapportering',
              n: 4,
              mean: null,
              nps: null,
              buckets: [
                { id: 'nei', label: 'Nei', score: 2, cell },
                { id: 'ja', label: 'Ja', score: 0, cell: { suppressed: true } },
              ],
            },
          ],
        },
      ]}
    />,
  );
  expect(view.div.querySelector('svg')?.getAttribute('aria-label')).toBe(
    'Rapportering: 75 % kritisk',
  );
  expect(view.div.querySelectorAll('svg circle')).toHaveLength(2);
  expect(view.div.textContent).toContain('Nei3 · 75 %');
  expect(view.div.textContent).toContain('Ja–');
});
it('KI history column and red marked answers use the server model, with no unsafe HTML', async () => {
  const data: Employees = {
    template: 'ki',
    client: 'daco',
    previous_round: { id: 'old', name: 'Førre KI-runde' },
    summary: { matched: 0, better: 0, worse: 0, same: 0 },
    columns: [{ id: 'K19', label: 'Jobbdata i KI' }],
    rows: [
      {
        submission_id: 'synthetic-id',
        respondent_key: 'ZZTEST',
        role: 'Kontor',
        client: 'daco',
        client_name: 'Daco',
        mean: null,
        zone: null,
        marked: [],
        columns: [{ id: 'K19', label: 'Privat konto', marked: true }],
        previous: { mean: null, zone: null, label: 'Prøvd, usikker', change: 'opp' },
      },
    ],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(data)))),
  );
  const fetcher = vi.mocked(fetch);
  view = mount(<EmployeeSection query="round=synthetic" />, true);
  await settle();
  // Folded at first: no rows are read (or logged) until someone opens the block (2.17).
  expect(fetcher).not.toHaveBeenCalled();
  openFold(view.div);
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(view.div.textContent).toContain('Førre runde');
  expect(view.div.querySelector('td.merk')?.textContent).toBe('Privat konto');
  expect(view.div.textContent).toContain('Prøvd, usikker → opp');
});
it('quotes render as plain text and never invent a role omitted by privacy', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            quotes: [
              {
                submission_id: 'synthetic',
                question: 'K15',
                label: 'Oppgåve',
                text: '<script>syntetisk</script>',
                client: 'daco',
                client_name: 'Daco',
              },
            ],
          }),
        ),
      ),
    ),
  );
  view = mount(<QuotesSection query="round=anonymous" showClient />, true);
  await settle();
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  openFold(view.div);
  await settle();
  expect(view.div.querySelector('script')).toBeNull();
  expect(view.div.querySelector('blockquote')?.textContent).toBe('<script>syntetisk</script>');
  expect(view.div.querySelector('.kjelde')?.textContent).toBe('Daco');
});

it('a closed round keeps its finding and links to a newer rule version inside the admin', () => {
  const finding = {
    key: 'tryggleik.f8',
    version: 1,
    latest_version: 2,
    n: 12,
    count: 4,
    share: 4 / 12,
    level: 'high' as const,
    text: 'brukar same passord på fleire tenester',
    action: 'Passordhandterar først.',
    severity: 'risk',
    tal: '4 av 12',
  };
  const moved = vi.fn();
  window.addEventListener('popstate', moved);
  view = mount(
    <Findings findings={[finding, { ...finding, key: 'tryggleik.f9', latest_version: 1 }]} />,
  );
  const links = view.div.querySelectorAll<HTMLAnchorElement>('a.nyare-regel');
  expect(links).toHaveLength(1);
  expect(links[0]!.textContent).toBe('Regelen har ein nyare versjon');
  expect(links[0]!.getAttribute('href')).toBe('/admin/surveys/funn?rule=tryggleik.f8');
  act(() => links[0]!.click());
  expect(window.location.pathname + window.location.search).toBe(
    '/admin/surveys/funn?rule=tryggleik.f8',
  );
  expect(moved).toHaveBeenCalledTimes(1);
  window.removeEventListener('popstate', moved);
  window.history.replaceState(null, '', '/');
});

it('names the thresholds of the rules, or points to «Funn-reglar» when the rules differ (16.10)', () => {
  expect(thresholdText({ min_count: 2, medium: 0.15, high: 0.3 })).toBe(
    'Funn rekna ut frå svara: minst 2 personar, middels frå 15 %, høg frå 30 %.',
  );
  expect(thresholdText({ min_count: 3, medium: 0.125, high: 0.3 })).toBe(
    'Funn rekna ut frå svara: minst 3 personar, middels frå 12,5 %, høg frå 30 %.',
  );
  for (const t of [{ min_count: 2, medium: null, high: 0.3 }, undefined])
    expect(thresholdText(t)).toBe(
      'Funn rekna ut frå svara etter tersklane i kvar regel (sjå «Funn-reglar» under Skjema).',
    );
});
