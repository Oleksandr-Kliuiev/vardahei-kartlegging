import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { LaunchForm } from '../src/launch-form.js';
import { ClientForm } from '../src/clients-form.js';
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
