import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DashboardPage } from '../src/dashboard-page.js';
import { KeyQuestions } from '../src/dashboard-aggregate.js';
import { EmployeeSection, QuotesSection } from '../src/dashboard-rows.js';
import type { Dashboard, Employees } from '../src/dashboard-models.js';
import { mount, settle } from './support.js';

let view: ReturnType<typeof mount> | undefined;
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
  view = mount(<DashboardPage />, true);
  await settle();
  await settle();
  const labels = [...view.div.querySelectorAll('label')];
  expect(labels.map((l) => l.textContent)).toEqual(['Runde', 'Kunde', 'Rolle']);
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
  view = mount(<EmployeeSection query="round=synthetic" />, true);
  await settle();
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
  expect(view.div.querySelector('script')).toBeNull();
  expect(view.div.querySelector('blockquote')?.textContent).toBe('<script>syntetisk</script>');
  expect(view.div.querySelector('.kjelde')?.textContent).toBe('Daco');
});
