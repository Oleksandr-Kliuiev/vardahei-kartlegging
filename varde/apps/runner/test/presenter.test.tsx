// 3.5 (unit, jsdom): the big screen. The key comes in the fragment and leaves the address bar at
// once; it goes only as a bearer, never in a URL. The stream is read with fetch and every event is
// a whole snapshot; the screen shows «N har svart» while a question is open, bars only for a shown
// result, and «For få svar til å vise tal» without numbers below k; the presenter's buttons follow
// the state of the chosen question.
import { act } from 'preact/test-utils';
import { render } from 'preact';
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { setMotion } from '@varde/ui/motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBlock, takeKey, type LiveSnapshot } from '../src/presenter/api.js';
import { Controls, defaultChoice, PresenterApp } from '../src/presenter/app.js';
import { BigScreen } from '../src/presenter/screen.js';
import { st } from '../src/presenter/texts.js';

const KEY = 'K'.repeat(43);
const root = document.createElement('div');
document.body.appendChild(root);

const q = (no: number, state: LiveSnapshot['questions'][number]['state']) => ({
  id: `L${no}`,
  no,
  state,
  text: { nn: `Spørsmål nummer ${no}`, en: `Question number ${no}` },
});
const QR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25" shape-rendering="crispEdges" role="img" aria-label="QR-kode"><rect width="100%" height="100%" fill="#fff"/><path d="M2,2h1v1h-1z" fill="#000"/></svg>';
function snapshot(over: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return {
    round: 'r1',
    seminar: { id: 's1', topic: { nn: 'Passord og MFA' }, when: '' },
    languages: ['nn', 'en'],
    link: 'https://varde.test/r?c=Abcdefghijklmnopqrstuv',
    qr: QR,
    total: 3,
    questions: [q(1, 'released'), q(2, 'waiting'), q(3, 'waiting')],
    current: null,
    at: '2026-11-05T09:00:00.000Z',
    ...over,
  };
}
const count = (n: number): NonNullable<LiveSnapshot['current']>['answered'] =>
  n < 3 ? { class: 'aggregate', suppressed: true } : { class: 'aggregate', suppressed: false, n };
const current = (
  state: LiveSnapshot['questions'][number]['state'],
  result: NonNullable<LiveSnapshot['current']>['result'] = null,
  answered: NonNullable<LiveSnapshot['current']>['answered'] = count(7),
) => ({
  ...q(2, state),
  multi: false,
  options: [
    { id: 'ja', text: { nn: 'Ja' } },
    { id: 'nei', text: { nn: 'Nei' } },
  ],
  answered,
  result,
});

beforeEach(() => {
  setMotion('reduced');
  sessionStorage.clear();
});
afterEach(async () => {
  await act(() => render(null, root));
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

describe('the key', () => {
  it('comes from the fragment, moves to session storage and leaves the address bar', () => {
    history.replaceState(null, '', `/p#t=${KEY}`);
    expect(takeKey()).toBe(KEY);
    expect(location.href).not.toContain(KEY);
    expect(location.hash).toBe('');
    expect(sessionStorage.getItem('varde:storskjerm')).toBe(KEY);
    // A reload of the same tab finds it again; a malformed fragment is ignored.
    expect(takeKey()).toBe(KEY);
    sessionStorage.clear();
    history.replaceState(null, '', '/p#t=kort');
    expect(takeKey()).toBeNull();
  });

  it('goes as a bearer to the stream; without a key the page says how to get one', async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetcher);
    history.replaceState(null, '', `/p#t=${KEY}`);
    await act(() => render(<PresenterApp />, root));
    expect(fetcher).toHaveBeenCalledWith(
      '/api/presenter/stream',
      expect.objectContaining({ headers: { Authorization: `Bearer ${KEY}` } }),
    );
    for (const [url] of fetcher.mock.calls as unknown as [string][]) expect(url).not.toContain(KEY);
    await act(() => render(null, root));
    sessionStorage.clear();
    history.replaceState(null, '', '/p');
    await act(() => render(<PresenterApp />, root));
    expect(root.textContent).toContain(st('nn', 'ingenNokkel'));
  });

  it('reads SSE blocks: event and data, comments and retry ignored', () => {
    expect(parseBlock('event: snapshot\ndata: {"a":1}')).toEqual({
      event: 'snapshot',
      data: '{"a":1}',
    });
    expect(parseBlock(': ping')).toBeNull();
    expect(parseBlock('retry: 2000')).toBeNull();
  });
});

describe('the big screen', () => {
  it('before the first question: «Svar på mobilen», the QR code and the short link', async () => {
    await act(() =>
      render(<BigScreen snapshot={snapshot({ questions: [q(1, 'waiting')] })} lang="nn" />, root),
    );
    expect(root.querySelector('h1')?.textContent).toBe('Svar på mobilen');
    expect(root.querySelector('.qr-kode svg')).not.toBeNull();
    expect(root.textContent).toContain('varde.test/r?c=Abcdefghijklmnopqrstuv');
    expect(root.textContent).not.toContain('https://');
  });

  it('an open question shows only how many have answered', async () => {
    await act(() =>
      render(<BigScreen snapshot={snapshot({ current: current('open') })} lang="nn" />, root),
    );
    expect(root.querySelector('.svart')?.textContent).toBe('7 har svart');
    expect(root.querySelector('.stolpar')).toBeNull();
    expect(root.querySelector('.tilstand')?.textContent).toBe('Ope');
  });

  it('below three answers: «Færre enn tre har svart», open or closed, without a number', async () => {
    for (const state of ['open', 'closed'] as const) {
      await act(() =>
        render(
          <BigScreen snapshot={snapshot({ current: current(state, null, count(2)) })} lang="nn" />,
          root,
        ),
      );
      expect(root.querySelector('.svart')?.textContent).toBe('Færre enn tre har svart');
      expect(root.querySelector('.svart')?.textContent).not.toMatch(/\d/);
    }
    await act(() =>
      render(
        <BigScreen snapshot={snapshot({ current: current('open', null, count(2)) })} lang="en" />,
        root,
      ),
    );
    expect(root.querySelector('.svart')?.textContent).toBe('Fewer than three have answered');
  });

  it('a shown result: bars and shares; below k: «For få svar til å vise tal» without any number', async () => {
    const result = {
      class: 'aggregate' as const,
      suppressed: false as const,
      n: 4,
      options: [
        { id: 'ja', count: 3, share: 0.75 },
        { id: 'nei', count: 1, share: 0.25 },
      ],
    };
    await act(() =>
      render(
        <BigScreen snapshot={snapshot({ current: current('released', result) })} lang="nn" />,
        root,
      ),
    );
    const rows = [...root.querySelectorAll('.stolpar .rad')];
    expect(rows.map((r) => r.querySelector('.etikett')?.textContent)).toEqual(['Ja', 'Nei']);
    expect(rows.map((r) => r.querySelector('.prosent')?.textContent)).toEqual(['75 %', '25 %']);
    expect(rows[0]!.querySelector<HTMLElement>('.stolpe i')!.style.transform).toBe('scaleX(0.75)');
    expect(root.querySelector('.svart')).toBeNull();
    await act(() =>
      render(
        <BigScreen
          snapshot={snapshot({
            current: current('released', { class: 'aggregate', suppressed: true }, null),
          })}
          lang="nn"
        />,
        root,
      ),
    );
    expect(root.querySelector('.for-fa b')?.textContent).toBe('For få svar til å vise tal');
    expect(root.querySelector('.hovud')?.textContent).not.toMatch(/\d %|\d har svart/);
  });

  it('draws only a QR code made of squares', async () => {
    await act(() =>
      render(
        <BigScreen snapshot={snapshot({ qr: '<svg><script>alert(1)</script></svg>' })} lang="nn" />,
        root,
      ),
    );
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('.qr-kode')).toBeNull();
  });
});

describe('the presenter controls', () => {
  it('act on the open question, a closed one waiting to be shown, else the next waiting', () => {
    expect(defaultChoice(snapshot())?.id).toBe('L2');
    expect(defaultChoice(snapshot({ questions: [q(1, 'closed'), q(2, 'open')] }))?.id).toBe('L2');
    expect(
      defaultChoice(
        snapshot({ questions: [q(1, 'released'), q(2, 'closed')], current: current('closed') }),
      )?.id,
    ).toBe('L2');
  });

  it('«Opne», «Steng» and «Vis» follow the state; one click, one request', async () => {
    let resolve: () => void = () => undefined;
    const onStep = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const s = snapshot({
      questions: [q(1, 'released'), q(2, 'closed'), q(3, 'waiting')],
      current: current('closed'),
    });
    await act(() => render(<Controls snapshot={s} lang="nn" onStep={onStep} />, root));
    const button = (id: string) => root.querySelector<HTMLButtonElement>(`#styr-${id}`)!;
    expect(button('open').disabled).toBe(false);
    expect(button('close').disabled).toBe(true);
    expect(button('release').disabled).toBe(false);
    expect(button('release').className).toContain('primary');
    await act(() => button('release').click());
    await act(() => button('release').click());
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenCalledWith('L2', 'release');
    await act(() => resolve());
  });

  it('the texts are nynorsk', () => {
    for (const key of [
      'faerre',
      'svarPaMobilen',
      'stengtTekst',
      'forFa',
      'forFaTekst',
      'fleireVal',
      'ingenNokkel',
      'borte',
    ] as const)
      expect(findBokmal(st('nn', key))).toEqual([]);
  });
});
