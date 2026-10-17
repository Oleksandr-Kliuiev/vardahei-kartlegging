import { afterEach, expect, it } from 'vitest';
import { ClientTrails } from '../src/overview.js';
import { mount } from './support.js';
import type { Progress, Round } from '../src/models.js';

let view: ReturnType<typeof mount>;
afterEach(() => view.close());

const round = (population: number | null): Round => ({
  id: 'round',
  name: 'Runde',
  status: 'open',
  template_version_id: 'version',
  round_clients: [
    {
      id: 'rc',
      client_id: 'client',
      client: { name: 'Syntetisk kunde' },
      status: 'open',
      deadline: null,
      population_snapshot: population,
    },
  ],
});
const progress = (population: number | null, answers: number) =>
  ({
    round_client_id: 'rc',
    population_snapshot: population,
    responses_total: answers,
    last_response_day: null,
    in_progress: { suppressed: true },
    abandoned: { suppressed: true },
    started: { suppressed: true },
    median_duration_s: { suppressed: true },
    stopped: {},
  }) as unknown as Progress;
const left = () =>
  parseFloat(view.div.querySelector<HTMLElement>('.mini-gaar')!.style.left.replace('%', ''));

it('walks by the number of answers when the head count is unknown, without empty dots', () => {
  view = mount(<ClientTrails round={round(null)} clients={[progress(null, 14)]} />, true);
  expect(view.div.querySelectorAll('.p.on')).toHaveLength(14);
  expect(view.div.querySelectorAll('.p:not(.on)')).toHaveLength(0);
  expect(left()).toBeGreaterThan(15);
  expect(view.div.textContent).toContain('Tal tilsette manglar');
});

it('stands at the start with no answers and walks further with more', () => {
  view = mount(<ClientTrails round={round(null)} clients={[progress(null, 0)]} />, true);
  expect(left()).toBeLessThan(5);
  view.close();
  view = mount(<ClientTrails round={round(20)} clients={[progress(20, 10)]} />, true);
  expect(view.div.querySelectorAll('.p')).toHaveLength(20);
  expect(left()).toBeGreaterThan(40);
});
