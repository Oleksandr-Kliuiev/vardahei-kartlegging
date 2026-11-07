// 2.22b the actions of the catalogue beyond the conversation: «Tiltak som går igjen» in Oversikt with the
// actions first and the seminar topic as the chip; the client page list with the status control of the
// findings at the action's own address; the catalogue on «Funn-reglar» with «Nytt tiltak».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Tiltakskatalog } from '../src/funn-tiltak.js';
import { type ChosenAction, KundeSamtaleTiltak } from '../src/kunde-samtale-tiltak.js';
import { KundePage } from '../src/kunde-page.js';
import type { Overview } from '../src/samtale-models.js';
import { TiltakIgjen } from '../src/samtale-tiltak-oversikt.js';
import { button, mount, settle } from './support.js';
import { fetcher, id, server, setValue } from './samtale-tiltak-support.js';

const sent = server.sent;
let view: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  server.reset();
  fetcher.mockClear();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
});

const overview = (o: Partial<Overview>): Overview => ({
  rounds: [],
  in_progress: false,
  questions: [
    {
      id: 'N2',
      no: 1,
      short: 'Ansvar',
      section: 'A',
      text: '',
      help: null,
      counts: c(),
      actions: 0,
    },
    {
      id: 'N3',
      no: 2,
      short: 'Rutinar',
      section: 'A',
      text: '',
      help: null,
      counts: c(),
      actions: 0,
    },
    {
      id: 'N4',
      no: 3,
      short: 'E-post',
      section: 'B',
      text: '',
      help: null,
      counts: c(),
      actions: 0,
    },
  ],
  sections: [],
  conversations: [],
  totals: {
    conversations: 4,
    done: 4,
    in_progress: 0,
    shown: 4,
    counts: c(),
    score: null,
    actions: 3,
  },
  actions: [],
  ...o,
});
function c() {
  return { ivaretatt: 0, forbetring: 0, manglar: 0, ikkje_aktuelt: 0, none: 0 };
}

describe('«Tiltak som går igjen» in Oversikt', () => {
  it('lists the actions of the catalogue first, with the seminar topic as the chip, then the written ones', () => {
    view = mount(
      <TiltakIgjen
        o={overview({
          catalog: [
            {
              action: { id: 'a', name: 'Passordhandterar', seminar_topic: 'Passord' },
              clients: 3,
              questions: ['N2', 'N4'],
            },
            {
              action: { id: 'b', name: 'Phishing-øving', seminar_topic: 'Svindel' },
              clients: 1,
              questions: ['N3'],
            },
          ],
          actions: [
            { question: 'N4', clients: 2, texts: [{ text: 'Reglar for e-post', clients: 2 }] },
          ],
        })}
      />,
    );
    const [first, second] = [...view.div.querySelectorAll('ul.sm-tiltak')];
    expect([...view.div.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      'Frå katalogen',
      'Andre skrivne tiltak',
    ]);
    const rows = [...first!.querySelectorAll(':scope > li')];
    expect(rows.map((r) => r.querySelector('b')!.textContent)).toEqual([
      'Passordhandterar',
      'Phishing-øving',
    ]);
    expect(rows[0]!.textContent).toContain('3av 4 kundar');
    expect(rows[0]!.textContent).toContain('Spørsmål 1 · Ansvar, 3 · E-post');
    // The topic is the chip; accent for half or more of the clients, a seminar candidate.
    const topic = (r: Element) => r.querySelector('.sm-tiltak-tema')!;
    expect(topic(rows[0]!).textContent).toBe('Seminartema: Passord');
    expect(topic(rows[0]!).className).toContain('accent');
    expect(topic(rows[1]!).className).not.toContain('accent');
    expect(second!.textContent).toContain('Reglar for e-post');
    expect(second!.textContent).toContain('Seminartema?');
  });

  it('without actions of the catalogue it is the list of 2.21, without headings', () => {
    view = mount(
      <TiltakIgjen
        o={overview({
          actions: [{ question: 'N2', clients: 1, texts: [{ text: 'Peik ut', clients: 1 }] }],
        })}
      />,
    );
    expect(view.div.querySelectorAll('h3')).toHaveLength(0);
    expect(view.div.textContent).toContain('Peik utSpørsmål 1 · Ansvar');
    view.close();
    view = mount(<TiltakIgjen o={overview({})} />);
    expect(view.div.textContent).toContain('Ingen tiltak er skrivne enno.');
  });
});

const chosen = (over: Partial<ChosenAction>): ChosenAction => ({
  interview: 'i1',
  conversation: { status: 'done', held_on: '2026-11-10', round: { id: 'r1', name: 'Haust 2026' } },
  question: { id: 'N4', no: 3, short: 'E-post' },
  action: { id: id(1), name: 'Passordhandterar', seminar_topic: 'Passord' },
  status: 'open',
  seminar: null,
  changed_by: null,
  changed_at: null,
  ...over,
});

describe('the actions of the conversations under «Funn» on the client page', () => {
  it('lists the open ones, folds the done ones, each with the status control at its own address', async () => {
    server.chosen = [
      chosen({}),
      chosen({
        action: { id: id(2), name: 'Phishing-øving', seminar_topic: 'Svindel' },
        status: 'in_seminar',
      }),
      chosen({
        action: { id: id(3), name: 'Beredskapsplan', seminar_topic: 'Beredskap' },
        status: 'closed',
      }),
    ];
    view = mount(
      <KundeSamtaleTiltak
        client="c1"
        status={(row, text, to) => (
          <span className="status" data-to={to} data-text={text}>
            {row.status}
          </span>
        )}
      />,
      true,
    );
    await settle();
    const section = view.div.querySelector('section')!;
    expect(section.querySelector('h3')!.textContent).toBe('Tiltak frå samtalane');
    const open = [...section.querySelectorAll(':scope > ul > li')];
    expect(open.map((li) => li.querySelector('.kst-namn')!.textContent)).toEqual([
      'Passordhandterar',
      'Phishing-øving',
    ]);
    expect([...open[0]!.querySelectorAll('.kst-meta')].map((p) => p.textContent)).toEqual([
      'Seminartema: Passord',
      'Spørsmål 3 «E-post» · Haust 2026, 10.11.2026',
    ]);
    expect(open[0]!.querySelector('a')!.getAttribute('href')).toBe('/admin/samtalar/i1?q=N4');
    expect(open[1]!.querySelector('.status')!.getAttribute('data-to')).toBe(
      `/api/admin/interviews/i1/actions/N4/${id(2)}/status`,
    );
    expect(open[1]!.querySelector('.status')!.getAttribute('data-text')).toBe(
      'Phishing-øving (spørsmål 3)',
    );
    const done = section.querySelector('details')!;
    expect(done.querySelector('summary')!.textContent).toBe('Ferdige (1)');
    expect(done.textContent).toContain('Beredskapsplan');
  });

  it('is not there for a client with no actions chosen', async () => {
    view = mount(<KundeSamtaleTiltak client="c1" status={() => null} />, true);
    await settle();
    expect(view.div.innerHTML).toBe('');
  });

  it('on the client page the status control of the findings saves to the action', async () => {
    server.chosen = [chosen({})];
    view = mount(<KundePage id="c1" />, true);
    await settle();
    await settle();
    const edit = view.div.querySelector<HTMLButtonElement>(
      'button[aria-label="Endre status for tiltaket: Passordhandterar (spørsmål 3)"]',
    )!;
    expect(edit).not.toBeNull();
    act(() => edit.click());
    const select = view.div.querySelector<HTMLSelectElement>(
      'select[aria-label="Status for tiltaket: Passordhandterar (spørsmål 3)"]',
    )!;
    act(() => {
      select.value = 'closed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      button(view!.div, 'Lagre').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(sent).toEqual([
      {
        url: `/api/admin/interviews/i1/actions/N4/${id(1)}/status`,
        method: 'PUT',
        body: { status: 'closed' },
      },
    ]);
  });
});

describe('the catalogue on «Funn-reglar»', () => {
  it('lists the actions with their seminar topic and adds a new one', async () => {
    view = mount(<Tiltakskatalog />, true);
    await settle();
    expect(view.div.querySelector('h2')!.textContent).toBe('Tiltakskatalog');
    expect([...view.div.querySelectorAll('.tk-liste b')].map((b) => b.textContent)).toEqual([
      'Beredskapsplan',
      'Passordhandterar',
      'Phishing-øving',
    ]);
    act(() => button(view!.div, 'Nytt tiltak').click());
    const field = (label: string) =>
      [...view!.div.querySelectorAll('label')]
        .find((l) => l.querySelector('span')?.textContent === label)!
        .querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!;
    expect(document.activeElement).toBe(field('Namn'));
    // What is missing is said in words; the button is never just grey.
    act(() => setValue(field('Namn'), 'MFA'));
    await act(async () => {
      button(view!.div, 'Lagre tiltaket').click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(view.div.querySelector('form')!.textContent).toContain(
      'Skriv kva tiltaket går ut på og seminartema.',
    );
    expect(sent).toEqual([]);
    for (const [label, text] of [
      ['Namn', ' MFA for alle '],
      ['Kva går tiltaket ut på?', 'Slå på MFA.'],
      ['Seminartema', 'Innlogging'],
    ] as const)
      act(() => setValue(field(label), text));
    await act(async () => {
      button(view!.div, 'Lagre tiltaket').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(sent).toEqual([
      {
        url: '/api/admin/actions',
        method: 'POST',
        body: { name: 'MFA for alle', description: 'Slå på MFA.', seminar_topic: 'Innlogging' },
      },
    ]);
    expect(document.activeElement?.textContent).toBe('Nytt tiltak');
  });
});
