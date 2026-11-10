// 2.22b the choice of actions of the catalogue under «Konklusjon og tiltak»: chips that can be taken
// away, a list to search by keyboard or pointer, the sorted ids as one field of the save store, read only
// when finished, a note when the catalogue is empty, a change on another screen with names; and the
// summary and the referat naming the chosen actions beside the conclusion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useSyncExternalStore } from 'react';
import { Lagring } from '../src/samtale-lagring.js';
import { idsOf, KatalogTiltak, matches, PunktTiltak, valueOf } from '../src/samtale-tiltak.js';
import { ReferatTiltak } from '../src/samtale-tiltak-oversikt.js';
import { button, mount, settle } from './support.js';
import { CATALOG, fetcher, id, server, setValue } from './samtale-tiltak-support.js';

const sent = server.sent;
let view: ReturnType<typeof mount> | undefined;
let n = 0;
const stores: Lagring[] = [];
beforeEach(() => {
  localStorage.clear();
  server.reset();
  fetcher.mockClear();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(async () => {
  view?.close();
  view = undefined;
  // What a test changed is sent now, while the fake server still answers.
  for (const s of stores.splice(0)) await s.flush();
  vi.unstubAllGlobals();
});

function storeWith(value = '', locked = false) {
  const s = new Lagring(`tiltak-${(n += 1)}`);
  s.load({ 'N4:action': '', 'N4:actions': value }, locked);
  stores.push(s);
  return s;
}
/** The question card's part, re-rendered on every change of the store as the conversation page does. */
function Med({ s, readOnly = false }: { s: Lagring; readOnly?: boolean }) {
  useSyncExternalStore(s.subscribe, () => s.version);
  return <KatalogTiltak store={s} question="N4" readOnly={readOnly} />;
}
const chips = () =>
  [...view!.div.querySelectorAll('.sm-katalog-chip > span')].map((x) => x.textContent);
const input = () => view!.div.querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = () => [...view!.div.querySelectorAll<HTMLElement>('[role="option"]')];
const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });
const type = (el: HTMLInputElement, text: string) => act(() => setValue(el, text));

describe('the choice under «Konklusjon og tiltak»', () => {
  it('finds by every word of the name or the seminar topic; the value is the ids sorted, once', () => {
    expect(matches(CATALOG, 'passord').map((a) => a.name)).toEqual(['Passordhandterar']);
    expect(matches(CATALOG, 'SVINDEL øv').map((a) => a.name)).toEqual(['Phishing-øving']);
    expect(matches(CATALOG, '  ')).toHaveLength(3);
    expect(valueOf([id(3), id(1), id(3)])).toBe(`${id(1)},${id(3)}`);
    expect(idsOf('')).toEqual([]);
  });

  it('shows the chosen actions as chips; one taken away moves the focus to the next', async () => {
    const s = storeWith(`${id(1)},${id(2)}`);
    view = mount(<Med s={s} />, true);
    await settle();
    expect(chips()).toEqual(['Passordhandterar', 'Phishing-øving']);
    const remove = view.div.querySelector<HTMLButtonElement>(
      'button[aria-label="Fjern Passordhandterar"]',
    )!;
    act(() => remove.click());
    expect(s.value('N4:actions')).toBe(id(2));
    expect(chips()).toEqual(['Phishing-øving']);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Fjern Phishing-øving');
    act(() => (document.activeElement as HTMLButtonElement).click());
    expect(s.value('N4:actions')).toBe('');
    expect(document.activeElement?.textContent).toBe('Legg til frå katalogen');
  });

  it('opens a list to search; the arrows and Enter take an action, a click another; the store sends the sorted ids', async () => {
    const s = storeWith(id(3));
    view = mount(<Med s={s} />, true);
    await settle();
    const opener = button(view.div, 'Legg til frå katalogen');
    expect(opener.getAttribute('aria-expanded')).toBe('false');
    act(() => opener.click());
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('aria-controls')).toBe(
      view.div.querySelector('[role="listbox"]')!.id,
    );
    // The catalogue's order; the chosen one is marked.
    expect(options().map((o) => [o.textContent, o.getAttribute('aria-selected')])).toEqual([
      ['BeredskapsplanSeminartema: Når noko går gale', 'true'],
      ['PassordhandterarSeminartema: Passord', 'false'],
      ['Phishing-øvingSeminartema: Phishing og svindel', 'false'],
    ]);
    type(input(), 'svindel');
    expect(options().map((o) => o.id)).toEqual([input().getAttribute('aria-activedescendant')]);
    key(input(), 'Enter');
    expect(s.value('N4:actions')).toBe(`${id(2)},${id(3)}`);
    type(input(), '');
    key(input(), 'ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1]!.id);
    key(input(), 'Enter');
    expect(s.value('N4:actions')).toBe(`${id(1)},${id(2)},${id(3)}`);
    // A click on a chosen one takes it away again; the focus stays in the search.
    act(() => options()[0]!.click());
    expect(s.value('N4:actions')).toBe(`${id(1)},${id(2)}`);
    expect(options()[0]!.getAttribute('aria-selected')).toBe('false');
    expect(view.div.querySelector('.sm-katalog-fot')!.textContent).toContain('2 valde');
    type(input(), 'pass');
    expect(view.div.querySelector('.sm-katalog-fot [role="status"]')!.textContent).toBe(
      '1 treff · 2 valde',
    );
    type(input(), '');
    await act(async () => {
      await s.flush();
    });
    expect(sent.at(-1)).toEqual({
      url: '/api/admin/interviews/' + s.id + '/answers/N4',
      method: 'PUT',
      body: { field: 'actions', value: `${id(1)},${id(2)}`, expect: id(3) },
    });
  });

  it('Escape and «Ferdig» close the list and give the focus back; a press outside closes it too', async () => {
    view = mount(<Med s={storeWith()} />, true);
    await settle();
    act(() => button(view!.div, 'Legg til frå katalogen').click());
    key(input(), 'Escape');
    expect(input()).toBeNull();
    expect(document.activeElement?.textContent).toBe('Legg til frå katalogen');
    act(() => button(view!.div, 'Legg til frå katalogen').click());
    act(() => button(view!.div, 'Ferdig').click());
    expect(view.div.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Legg til frå katalogen');
    act(() => button(view!.div, 'Legg til frå katalogen').click());
    act(() => {
      // jsdom has no PointerEvent; the listener only reads the type and the target.
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(view.div.querySelector('[role="listbox"]')).toBeNull();
  });

  it('the list takes the keyboard too when Tab brings the focus there: Home, End and Space', async () => {
    const s = storeWith();
    view = mount(<Med s={s} />, true);
    await settle();
    act(() => button(view!.div, 'Legg til frå katalogen').click());
    const box = view.div.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(box.tabIndex).toBe(0);
    act(() => box.focus());
    key(box, 'End');
    expect(box.getAttribute('aria-activedescendant')).toBe(options()[2]!.id);
    key(box, ' ');
    expect(s.value('N4:actions')).toBe(id(2));
    key(box, 'Home');
    key(box, 'Enter');
    expect(s.value('N4:actions')).toBe(`${id(2)},${id(3)}`);
    key(box, 'Escape');
    expect(document.activeElement?.textContent).toBe('Legg til frå katalogen');
  });

  it('a finished conversation shows the chips without buttons and offers no list', async () => {
    view = mount(<Med s={storeWith(id(2), true)} readOnly />, true);
    await settle();
    expect(chips()).toEqual(['Phishing-øving']);
    expect(view.div.querySelectorAll('button')).toHaveLength(0);
    view.close();
    // Nothing chosen in a finished conversation: the block is not there at all (10.11).
    view = mount(<Med s={storeWith('', true)} readOnly />, true);
    await settle();
    expect(view.div.querySelector('.sm-katalog')).toBeNull();
  });

  it('an empty catalogue takes no room under the question (10.11)', async () => {
    // It said «Katalogen er tom» under every one of the 27 questions; nothing to choose, nothing shown.
    server.catalog = [];
    view = mount(<Med s={storeWith()} />, true);
    await settle();
    expect(view.div.querySelector('.sm-katalog')).toBeNull();
    expect(view.div.querySelectorAll('button')).toHaveLength(0);
  });

  it('a change on another screen names their actions; «Bruk deira» takes them', async () => {
    const s = storeWith(id(1));
    s.conflicts.set('N4:actions', { key: 'N4:actions', theirs: id(3), by: 'Asbjørn', base: id(1) });
    view = mount(<Med s={s} />, true);
    await settle();
    expect(view.div.querySelector('[role="alert"]')!.textContent).toContain(
      'Asbjørn har endra tiltaka på ein annan skjerm. Der står no: «Beredskapsplan».',
    );
    act(() => button(view!.div, 'Bruk deira').click());
    expect(s.value('N4:actions')).toBe(id(3));
    expect(view.div.querySelector('[role="alert"]')).toBeNull();
  });

  it('the summary and the referat name the chosen actions beside the conclusion', async () => {
    const s = storeWith(`${id(1)},${id(2)}`);
    view = mount(
      <p>
        <PunktTiltak store={s} question="N4" />
      </p>,
      true,
    );
    await settle();
    const list = view.div.querySelector('[role="list"]')!;
    expect(list.getAttribute('aria-label')).toBe('Tiltak frå katalogen');
    expect([...list.querySelectorAll('.chip')].map((c) => c.textContent)).toEqual([
      'Passordhandterar',
      'Phishing-øving',
    ]);
    view.close();
    view = mount(<PunktTiltak store={storeWith()} question="N4" />, true);
    expect(view.div.textContent).toBe('Ingen tiltak skrive');
    view.close();
    view = mount(<ReferatTiltak action="Reglar for e-post" catalog={['Passordhandterar']} />);
    expect(view.div.textContent).toBe('Reglar for e-postPassordhandterar');
    expect(view.div.querySelector('.sm-ark-katalog.sm-ark-etter')).not.toBeNull();
  });
});
