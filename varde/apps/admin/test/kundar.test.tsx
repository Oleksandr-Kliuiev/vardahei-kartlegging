// Wave A: tags on a client, one way of picking clients (search, tags, «Vel alle viste»), and
// «Legg til fleire kundar». What these tests hold is the work with 48 clients, not with three.
import { act } from 'react';
import { afterEach, expect, it, vi, describe } from 'vitest';
import { KundarPage } from '../src/kundar-page.js';
import { framsyn, parseLinje } from '../src/kundar-bolk.js';
import { Kundeval } from '../src/kundeval.js';
import type { Client } from '../src/models.js';
import { Toasts } from '../src/shell.js';
import { mount, settle } from './support.js';

let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
});

const client = (name: string, tags: string[] = []): Client => ({
  id: name.toLowerCase(),
  name,
  slug: name.toLowerCase(),
  employee_count: 10,
  tags,
  archived_at: null,
});
const CLIENTS = [
  client('Daco', ['it']),
  client('Gasta', ['it', 'bio']),
  client('Årdal Transport', ['bio']),
  client('Amla Sag'),
];
const button = (div: HTMLElement, text: string) =>
  [...div.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
const names = (div: HTMLElement) =>
  [...div.querySelectorAll('.kval-namn')].map((n) => n.firstChild?.textContent);
/** React keeps its own value tracker; a plain assignment never reaches onChange. */
const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    Reflect.set(Object.getPrototypeOf(el) as object, 'value', value, el);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('eitt kundeval', () => {
  function open(onChange = vi.fn()) {
    view = mount(
      <Kundeval clients={CLIENTS} chosen={[]} onChange={onChange} legend="Kundar i runden" />,
    );
    return { div: view.div, onChange };
  }
  it('lists the clients in Norwegian order and says how many are picked', () => {
    const { div } = open();
    expect(names(div)).toEqual(['Amla Sag', 'Daco', 'Gasta', 'Årdal Transport']);
    expect(div.querySelector('legend')?.textContent).toContain('0 valde');
  });
  it('narrows by the search', () => {
    const { div } = open();
    const search = div.querySelector<HTMLInputElement>('input[type="search"]')!;
    type(search, 'ga');
    expect(names(div)).toEqual(['Gasta']);
  });
  it('narrows by a tag, and «Vel alle viste» takes exactly that tag', () => {
    const { div, onChange } = open();
    act(() => button(div, 'it').click());
    expect(names(div)).toEqual(['Daco', 'Gasta']);
    act(() => button(div, 'Vel alle viste (2)').click());
    expect(onChange).toHaveBeenCalledWith(['daco', 'gasta']);
  });
  it('says so when nothing matches, instead of showing an empty box', () => {
    const { div } = open();
    const search = div.querySelector<HTMLInputElement>('input[type="search"]')!;
    type(search, 'finst ikkje');
    expect(div.textContent).toContain('Ingen kundar passar');
  });
});

describe('kundelista', () => {
  function serve() {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(JSON.stringify(url.includes('/clients') ? CLIENTS : []), { status: 200 }),
        ),
      ),
    );
  }
  it('counts what the filter shows, and the tags stand in the rows', async () => {
    serve();
    view = mount(
      <Toasts>
        <KundarPage />
      </Toasts>,
      true,
    );
    await settle();
    const div = view.div;
    expect(div.querySelector('.bib-tal')?.textContent).toBe('4 kundar');
    expect(div.querySelector('.rad-hovud .merkelappar')?.textContent).toBe('it');
    act(() => button(div, 'bio').click());
    expect(div.querySelector('.bib-tal')?.textContent).toBe('2 av 4 kundar');
    expect([...div.querySelectorAll('.rad-hovud b')].map((b) => b.textContent)).toEqual([
      'Gasta',
      'Årdal Transport',
    ]);
  });
});

describe('legg til fleire kundar', () => {
  it('reads a name, a head count and tags from one line', () => {
    expect(parseLinje('Daco')).toEqual({ name: 'Daco', employee_count: null, tags: [] });
    expect(parseLinje('Daco;25;IT, BIO')).toEqual({
      name: 'Daco',
      employee_count: 25,
      tags: ['it', 'bio'],
    });
    expect(parseLinje('  ')).toBeNull();
    // A head count that is not a whole number in range is left unset, never guessed.
    expect(parseLinje('Daco;ti')?.employee_count).toBeNull();
    expect(parseLinje('Daco;0')?.employee_count).toBeNull();
  });
  it('tells the new ones from those that are clients already, whatever the case', () => {
    const { nye, finst } = framsyn('Daco\nNy AS;12;BIO\n\ndaco\nGASTA', CLIENTS);
    expect(nye.map((c) => c.name)).toEqual(['Ny AS']);
    expect(nye[0]?.tags).toEqual(['bio']);
    expect(finst).toEqual(['daco', 'Daco', 'GASTA']);
  });
});
