// «Slett kunden»: the server is asked first; a client with ties gets the reason and no delete button.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { SlettKunde, tiesText, type ClientTies } from '../src/kunde-slett.js';
import { button, mount, settle } from './support.js';

const none: ClientTies = { rounds: 0, seminars: 0, interviews: 0, contacts: 0, history: 0 };
let ties = none;
const fetcher = vi.fn((_path: string, init?: RequestInit) => {
  const body = init?.method === 'DELETE' ? { id: 'c1' } : ties;
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
});
const client = { id: 'c1', name: 'ZZ Dublett' };
const deletes = () => fetcher.mock.calls.filter(([, i]) => i?.method === 'DELETE');
const press = async (root: HTMLElement, name: string) => {
  act(() => {
    button(root, name).click();
  });
  await settle();
};

beforeEach(() => {
  ties = none;
  fetcher.mockClear();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());

describe('SlettKunde', () => {
  it('says what is tied in words', () => {
    expect(tiesText({ ...none, rounds: 2, seminars: 1, contacts: 3 })).toBe(
      '2 rundar, 1 seminar og 3 kontaktar',
    );
    expect(tiesText({ ...none, interviews: 1 })).toBe('1 samtale');
    expect(tiesText(none)).toBe('');
  });
  it('deletes only after the question', async () => {
    const m = mount(<SlettKunde client={client} />, true);
    await press(m.div, 'Slett kunden');
    expect(deletes()).toHaveLength(0);
    expect(m.div.textContent).toContain('kan ikkje angrast');
    await press(m.div, 'Slett kunden');
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0]![0]).toBe('/api/admin/clients/c1');
    m.close();
  });
  it('gives the reason and no delete button for a client with ties', async () => {
    ties = { ...none, rounds: 1 };
    const m = mount(<SlettKunde client={client} />, true);
    await press(m.div, 'Slett kunden');
    expect(m.div.textContent).toContain('knytt til 1 runde');
    expect([...m.div.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Lukk']);
    m.close();
  });
});
