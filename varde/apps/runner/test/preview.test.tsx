import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { Preview, PreviewSurvey } from '../src/preview.js';
import { syntheticContent, rendererQuestions } from '../e2e/support.js';

const root = document.createElement('div');
afterEach(() => {
  render(null, root);
  vi.unstubAllGlobals();
});
it('preview reuses real renderer without progress, storage or response writes', async () => {
  const fetcher = vi.fn(),
    storage = vi.spyOn(Storage.prototype, 'setItem');
  vi.stubGlobal('fetch', fetcher);
  await act(() =>
    render(
      <PreviewSurvey
        content={{ ...syntheticContent(), questions: rendererQuestions(), leader_roles: [] }}
      />,
      root,
    ),
  );
  const click = (name: string) =>
    act(() =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(name))!.click(),
    );
  await click('Start');
  expect(root.querySelector('[data-question-id]')).not.toBeNull();
  await act(() => root.querySelector<HTMLButtonElement>('[data-id="a"]')!.click());
  await click('Vidare');
  expect(fetcher).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
  storage.mockRestore();
});
it('unauthenticated preview cannot fetch the template and never falls back to live runner', async () => {
  const fetcher = vi.fn(() => Promise.resolve(new Response('{}', { status: 401 })));
  vi.stubGlobal('fetch', fetcher);
  await act(() => render(<Preview id="synthetic" />, root));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  expect(root.textContent).toContain('krev innlogging');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    '/api/admin/surveys/versions/synthetic/preview',
    expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
  );
});
