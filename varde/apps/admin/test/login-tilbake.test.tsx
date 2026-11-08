// The concept of Samtalar: when the session has run out, signing in comes back to the same question.
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, loginUrl } from '../src/api.js';
import type { Lagring } from '../src/samtale-lagring.js';
import { Utlogga } from '../src/samtale-page.js';
import { mount } from './support.js';

const at = (url: string) => window.history.pushState({}, '', url);
let view: ReturnType<typeof mount> | undefined;
beforeEach(() => at('/admin/samtalar/iv1?q=N5'));
afterEach(() => {
  view?.close();
  view = undefined;
  at('/');
  vi.unstubAllGlobals();
});

it('names this page and its question', () => {
  expect(loginUrl()).toBe('/auth/login?return_to=%2Fadmin%2Fsamtalar%2Fiv1%3Fq%3DN5');
});

it('any request that finds the session gone goes to the sign-in that comes back', async () => {
  const assign = vi.fn();
  vi.stubGlobal('location', { pathname: '/admin/rounds/r1', search: '?x=1', assign });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))),
  );
  await expect(api('/api/admin/rounds')).rejects.toThrow();
  expect(assign).toHaveBeenCalledWith('/auth/login?return_to=%2Fadmin%2Frounds%2Fr1%3Fx%3D1');
});

it('«Logg inn igjen» comes back to the question on the screen when it is pressed', () => {
  view = mount(<Utlogga store={{ state: { kind: 'auth' } } as unknown as Lagring} />);
  const link = view.div.querySelector('a')!;
  expect(link.getAttribute('href')).toBe(
    '/auth/login?return_to=%2Fadmin%2Fsamtalar%2Fiv1%3Fq%3DN5',
  );
  // Gone on to the next question while the banner stood there.
  at('/admin/samtalar/iv1?q=N6');
  link.addEventListener('click', (e) => e.preventDefault());
  act(() => link.click());
  expect(link.getAttribute('href')).toBe(
    '/auth/login?return_to=%2Fadmin%2Fsamtalar%2Fiv1%3Fq%3DN6',
  );
});
