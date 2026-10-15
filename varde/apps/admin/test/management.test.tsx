import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { LaunchForm } from '../src/launch-form.js';
import { ClientForm } from '../src/clients-form.js';
import { SurveyEditor } from '../src/survey-editor.js';
import { JsonField } from '../src/editor-fields.js';
import { newQuestion } from '../src/question-editor.js';
import { editorFixture } from './editor-fixture.js';
import { mount, button, settle } from './support.js';

let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  vi.unstubAllGlobals();
});
function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const prototype: object =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it('launch selects all/none, uses defaults, submits once and shows invitation links only after launch', async () => {
  const fetcher = vi.fn((url: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          url.includes('invitation')
            ? { link: 'https://example.invalid/r?c=synthetic', text: 'Invitasjon', lang: 'nn' }
            : { round_client_ids: ['rc'], status: 'open' },
        ),
      ),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  view = mount(
    <LaunchForm
      clients={[{ id: 'c', name: 'Testkunde', slug: 'test', employee_count: 12 }]}
      versions={[{ id: 'v', label: 'v1', template: { key: 'test' } }]}
    />,
    true,
  );
  expect(view.div.textContent).not.toContain('Invitasjonar til den nye runden');
  act(() => button(view!.div, 'Vel alle').click());
  expect(view.div.querySelector<HTMLInputElement>('[name="count-c"]')!.value).toBe('12');
  act(() => button(view!.div, 'Vel ingen').click());
  expect(view.div.querySelector('[name="count-c"]')).toBeNull();
  act(() => button(view!.div, 'Vel alle').click());
  input(view.div.querySelector('[name="name"]')!, 'Ny runde');
  input(view.div.querySelector('[name="deadline-c"]')!, '2099-01-01');
  act(() => {
    view!.div.querySelector<HTMLSelectElement>('[name="version"]')!.value = 'v';
    view!.div.querySelector<HTMLInputElement>('[name="open"]')!.click();
    view!.div
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
  const launch = fetcher.mock.calls.find(([url]) => url.endsWith('/launch'));
  expect(launch).toBeTruthy();
  expect(fetcher).toHaveBeenCalledWith(
    '/api/admin/rounds/launch',
    expect.objectContaining({
      body: JSON.stringify({
        name: 'Ny runde',
        template_version_id: 'v',
        open: true,
        clients: [{ client_id: 'c', deadline: '2099-01-01', population_snapshot: 12 }],
      }),
    }),
  );
  expect(
    view.div.querySelector<HTMLInputElement>('[aria-label="Lenkje til kartlegginga"]')!.value,
  ).toContain('/r?c=');
});
it('client edits explicitly save both name and count', async () => {
  const fetcher = vi.fn(() => Promise.resolve(new Response('{}')));
  vi.stubGlobal('fetch', fetcher);
  view = mount(
    <ClientForm client={{ id: 'c', name: 'Test', slug: 'test', employee_count: 12 }} />,
    true,
  );
  input(view.div.querySelector('[name="name"]')!, 'Endra');
  input(view.div.querySelector('[name="count"]')!, '24');
  act(() => {
    view!.div
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
  expect(fetcher).toHaveBeenCalledWith(
    '/api/admin/clients/c',
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ name: 'Endra', employee_count: 24 }),
    }),
  );
});
it('JSON remains editable on syntax/schema errors and applies only on explicit use', async () => {
  const apply = vi.fn(() => {
    throw new Error('Kontroller spørsmålsfeltet.');
  });
  view = mount(<JsonField label="JSON" value={{ test: 1 }} onChange={apply} />);
  input(view.div.querySelector('textarea')!, '{');
  act(() => button(view!.div, 'Bruk JSON').click());
  await settle();
  expect(view.div.textContent).toContain('Skriv gyldig JSON.');
  expect(apply).not.toHaveBeenCalled();
  input(view.div.querySelector('textarea')!, 'null');
  act(() => button(view!.div, 'Bruk JSON').click());
  await settle();
  expect(view.div.textContent).toContain('Kontroller spørsmålsfeltet.');
  expect(view.div.querySelector('textarea')!.value).toBe('null');
});
it('all schema question types can be created and include the required languages', () => {
  for (const type of ['single', 'multi', 'text', 'scale', 'nps'] as const) {
    const q = newQuestion(type, 'Q', ['nn', 'en', 'nb']);
    expect(q.type).toBe(type);
    expect(Object.keys(q.texts.text)).toEqual(['nn', 'en', 'nb']);
  }
});
it('published editor is read only and has no save or publish action', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{"issues":[]}'))),
  );
  view = mount(<SurveyEditor initial={editorFixture('published')} changed={vi.fn()} />);
  expect(view.div.querySelector('fieldset')!.disabled).toBe(true);
  expect(view.div.textContent).not.toContain('Lagre utkast');
  expect(view.div.textContent).not.toContain('Publiser versjonen');
});
it('saving uses the loaded hash and a conflict preserves unsaved text', async () => {
  const fetcher = vi.fn((url: string) =>
    Promise.resolve(
      new Response(
        url.endsWith('/validate') ? '{"issues":[]}' : '{"message":"Ein annan har endra utkastet."}',
        { status: url.endsWith('/validate') ? 201 : 409 },
      ),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  const initial = editorFixture();
  view = mount(<SurveyEditor initial={initial} changed={vi.fn()} />);
  input(view.div.querySelector('[aria-label="Spørsmålstekst (nn)"]')!, 'Endra spørsmål');
  expect(
    [...view.div.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Godkjenn nn'))!
      .disabled,
  ).toBe(true);
  act(() => button(view!.div, 'Lagre utkast').click());
  await settle();
  expect(fetcher).toHaveBeenCalledWith(
    '/api/admin/surveys/versions/version',
    expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining(`"content_hash":"${initial.content_hash}"`) as unknown,
    }),
  );
  expect(
    view.div.querySelector<HTMLTextAreaElement>('[aria-label="Spørsmålstekst (nn)"]')!.value,
  ).toBe('Endra spørsmål');
  expect(view.div.textContent).toContain('Ein annan har endra utkastet.');
});
