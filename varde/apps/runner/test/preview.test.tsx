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
it('in a frame, unsaved content is taken only from the same-origin parent and must pass the schema', async () => {
  const content = syntheticContent();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ content }), { status: 200 }))),
  );
  const parent = { postMessage: vi.fn() };
  vi.stubGlobal('parent', parent);
  await act(() => render(<Preview id="synthetic" />, root));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  expect(parent.postMessage).toHaveBeenCalledWith({ type: 'varde:forhand-klar' }, location.origin);
  const send = (data: unknown, origin = location.origin, source: unknown = parent) =>
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
    });
  const title = { nn: 'Endra tittel frå editoren', en: 'Changed' };
  await send(
    { type: 'varde:forhand-innhald', content: { ...content, intro: { ...content.intro, title } } },
    'https://evil.example',
  );
  expect(root.textContent).not.toContain('Endra tittel frå editoren');
  await send(
    { type: 'varde:forhand-innhald', content: { ...content, intro: { ...content.intro, title } } },
    location.origin,
    window,
  );
  expect(root.textContent).not.toContain('Endra tittel frå editoren');
  await send({ type: 'varde:forhand-innhald', content: { nonsense: true } });
  expect(root.querySelector('h1')).not.toBeNull();
  await send({
    type: 'varde:forhand-innhald',
    content: { ...content, intro: { ...content.intro, title } },
  });
  expect(root.textContent).toContain('Endra tittel frå editoren');
});

async function framed(content: ReturnType<typeof syntheticContent>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ content }), { status: 200 }))),
  );
  const parent = { postMessage: vi.fn() };
  vi.stubGlobal('parent', parent);
  await act(() => render(<Preview id="synthetic" />, root));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  const send = (data: unknown) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data, origin: location.origin, source: parent as never }),
      );
    });
  return { parent, send };
}
const shown = () => root.querySelector('[data-question-id]')?.getAttribute('data-question-id');
it('the workshop moves the phone to a question and hears where the phone is', async () => {
  const { parent, send } = await framed(syntheticContent());
  // The start is not reported: the workshop keeps the question it asked for.
  expect(parent.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'varde:forhand-her' }),
    location.origin,
  );
  await send({ type: 'varde:forhand-ga', to: 'K6' });
  expect(shown()).toBe('K6');
  expect(parent.postMessage).toHaveBeenLastCalledWith(
    { type: 'varde:forhand-her', at: 'K6' },
    location.origin,
  );
  // A leader question switches the preview to a leader role, as the respondent's answer would.
  await send({ type: 'varde:forhand-ga', to: 'L2' });
  expect(shown()).toBe('L2');
  expect(root.textContent).not.toContain('skjuler dette spørsmålet');
  await send({ type: 'varde:forhand-ga', to: ':intro' });
  expect(shown()).toBeUndefined();
  expect(parent.postMessage).toHaveBeenLastCalledWith(
    { type: 'varde:forhand-her', at: ':intro' },
    location.origin,
  );
  await send({ type: 'varde:forhand-ga', to: 'finst-ikkje' });
  expect(shown()).toBeUndefined();
});
it('a question the answers hide is shown with the condition in words; Vidare leaves it', async () => {
  const { send } = await framed(syntheticContent());
  await send({
    type: 'varde:forhand-ga',
    to: 'K16',
    note: 'Blir berre vist når K3 har minst to val.',
  });
  expect(shown()).toBe('K16');
  expect(root.querySelector('.forhand-skjult')?.textContent).toBe(
    'Blir berre vist når K3 har minst to val.',
  );
  await act(() =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Tilbake'))!.click(),
  );
  expect(root.querySelector('.forhand-skjult')).toBeNull();
  expect(shown()).not.toBe('K16');
});
it('an unfinished draft is shown as far as it goes; the schema shape still guards', async () => {
  const content = syntheticContent();
  const { send } = await framed(content);
  const unfinished = structuredClone(content);
  delete unfinished.questions[1]!.texts.text.en;
  unfinished.intro.title = { nn: 'Utkast utan engelsk', en: '' };
  await send({ type: 'varde:forhand-innhald', content: unfinished });
  expect(root.textContent).toContain('Utkast utan engelsk');
  await send({ type: 'varde:forhand-innhald', content: { ...unfinished, questions: 'feil' } });
  expect(root.textContent).toContain('Utkast utan engelsk');
});
it('the phone keeps its place when the draft changes around it, and tells nothing', async () => {
  const content = syntheticContent();
  const { parent, send } = await framed(content);
  await send({ type: 'varde:forhand-ga', to: 'K6' });
  expect(shown()).toBe('K6');
  const told = parent.postMessage.mock.calls.length;
  // K6 moves up one place, then a new question comes in before it: the phone stays on K6.
  const moved = structuredClone(content);
  const i = moved.questions.findIndex((q) => q.id === 'K6');
  moved.questions.splice(i - 1, 0, moved.questions.splice(i, 1)[0]!);
  await send({ type: 'varde:forhand-innhald', content: moved });
  expect(shown()).toBe('K6');
  const added = structuredClone(moved);
  added.questions.splice(i - 1, 0, { ...structuredClone(added.questions[i - 1]!), id: 'N1' });
  await send({ type: 'varde:forhand-innhald', content: added });
  expect(shown()).toBe('K6');
  expect(parent.postMessage.mock.calls.length).toBe(told);
  // A hidden question shown on request takes its new wording.
  await send({ type: 'varde:forhand-ga', to: 'K16', note: 'Skjult.' });
  expect(shown()).toBe('K16');
  const reworded = structuredClone(added);
  reworded.questions.find((q) => q.id === 'K16')!.texts.text.nn = 'Ny ordlyd for K16';
  await send({ type: 'varde:forhand-innhald', content: reworded });
  expect(shown()).toBe('K16');
  expect(root.textContent).toContain('Ny ordlyd for K16');
  expect(root.querySelector('.forhand-skjult')?.textContent).toBe('Skjult.');
});
