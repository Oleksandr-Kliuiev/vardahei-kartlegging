import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProgressRound } from '../src/progress-page.js';
import { mount, settle } from './support.js';
import type { Round } from '../src/models.js';

let view: ReturnType<typeof mount>;
afterEach(() => {
  view.close();
  vi.unstubAllGlobals();
});
it('shows exact common count, unknown denominator as dash, and hides suppressed stop cells', async () => {
  const round: Round = {
    id: 'round',
    name: 'Syntetisk runde',
    status: 'open',
    template_version_id: 'version',
    round_clients: [
      {
        id: 'rc',
        client_id: 'client',
        client: { name: 'Syntetisk kunde' },
        status: 'open',
        deadline: null,
        population_snapshot: null,
      },
    ],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            class: 'aggregate',
            clients: [
              {
                round_client_id: 'rc',
                population_snapshot: null,
                responses_total: 4,
                last_response_day: '2026-10-14',
                in_progress: { suppressed: false, value: 3 },
                abandoned: { suppressed: true },
                started: { suppressed: false, value: 9 },
                median_duration_s: { suppressed: false, value: 120 },
                stopped: { '2': { suppressed: true }, '4': { suppressed: false, value: 3 } },
              },
            ],
          }),
        ),
      ),
    ),
  );
  view = mount(<ProgressRound round={round} />, true);
  await settle();
  const cells = [...view.div.querySelectorAll('tbody td')].map((e) => e.textContent);
  expect(cells).toEqual(['–', '4 svar–', '3', '–', expect.stringMatching(/^14\. oktober( 2026)?$/), '2 min.']);
  expect(view.div.querySelector('[data-question="2"]')).toBeNull();
  expect(view.div.querySelector('[data-question="4"]')?.textContent).toBe('Spørsmål 4: 3 avbrote');
  expect(view.div.querySelector('progress')).toBeNull();
  act(() => {
    view.client.setQueryData(['progress', 'round'], {
      clients: [
        {
          round_client_id: 'rc',
          population_snapshot: 20,
          responses_total: 4,
          last_response_day: null,
          in_progress: { suppressed: true },
          abandoned: { suppressed: true },
          started: { suppressed: true },
          median_duration_s: { suppressed: true },
          stopped: {},
        },
      ],
    });
  });
  await settle();
  expect(view.div.querySelector('.prosent')?.textContent).toBe('4 svar20 %');
});
