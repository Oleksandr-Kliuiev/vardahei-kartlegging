import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoundClientCard } from '../src/round-client.js';
import { mount, button, settle } from './support.js';

let view: ReturnType<typeof mount>;
const fetcher = vi.fn(() => Promise.resolve(new Response('{}')));
beforeEach(() => {
  fetcher.mockClear();
  vi.stubGlobal('fetch', fetcher);
  view = mount(
    <RoundClientCard
      rc={{
        id: 'synthetic',
        client_id: 'client',
        client: { name: 'Syntetisk kunde' },
        status: 'open',
        deadline: '2099-06-01',
        population_snapshot: 12,
      }}
    />,
    true,
  );
});
afterEach(() => {
  view.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('Ny lenkje', () => {
  it('requires two clicks and sends exactly one reissue mutation', async () => {
    act(() => {
      button(view.div, 'Ny lenkje').click();
    });
    expect(fetcher).not.toHaveBeenCalled();
    act(() => {
      button(view.div, 'Gamle lenkjer sluttar å verke. Stadfest').click();
    });
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/admin/round-clients/synthetic/reissue',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
  });
  it('confirmation expires after five seconds; a later click only rearms', () => {
    vi.useFakeTimers();
    act(() => {
      button(view.div, 'Ny lenkje').click();
    });
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(button(view.div, 'Gamle lenkjer sluttar å verke. Stadfest')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    act(() => {
      button(view.div, 'Ny lenkje').click();
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
