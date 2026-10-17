import { act, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { mount, settle, TestStream } from './support.js';

let view: ReturnType<typeof mount> | undefined;
const get = vi.fn((path: string) =>
  Promise.resolve(
    new Response(JSON.stringify(path === '/auth/me' ? { name: 'Syntetisk admin' } : [])),
  ),
);
beforeEach(() => {
  window.history.replaceState(null, '', '/admin');
  TestStream.streams = [];
  get.mockClear();
  get.mockImplementation((path) =>
    Promise.resolve(
      new Response(JSON.stringify(path === '/auth/me' ? { name: 'Syntetisk admin' } : [])),
    ),
  );
  vi.stubGlobal('fetch', get);
  vi.stubGlobal('EventSource', TestStream);
});
afterEach(() => {
  view?.close();
  vi.unstubAllGlobals();
});
describe('admin shell', () => {
  it('a failed auth probe during a server restart keeps automatic SSE reconnect alive', async () => {
    view = mount(<App />);
    await settle();
    const stream = TestStream.streams.find((s) => !s.closed)!;
    get.mockRejectedValueOnce(new TypeError('network unavailable'));
    act(() => {
      stream.onerror?.();
    });
    await settle();
    expect(stream.closed).toBe(false);
    get.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    act(() => {
      stream.onerror?.();
    });
    await settle();
    expect(stream.closed).toBe(false);
  });
  it('changed invalidates only its topic and refetches once through the single listener', async () => {
    const round = {
      id: 'synthetic-round',
      name: 'Syntetisk runde',
      status: 'open',
      round_clients: [],
    };
    get.mockImplementation((path) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            path === '/auth/me'
              ? { name: 'Syntetisk admin' }
              : path === '/api/admin/rounds'
                ? [round]
                : path.endsWith('/progress')
                  ? { clients: [] }
                  : [],
          ),
        ),
      ),
    );
    view = mount(<App />);
    await settle();
    await settle();
    const count = () => get.mock.calls.filter(([path]) => path.endsWith('/progress')).length;
    const before = count();
    expect(before).toBe(1);
    act(() => {
      TestStream.streams.find((s) => !s.closed)!.changed('progress');
    });
    await settle();
    expect(count()).toBe(before + 1);
    act(() => {
      TestStream.streams.find((s) => !s.closed)!.changed('responses');
    });
    await settle();
    expect(count()).toBe(before + 1);
  });
  it('loads the member name with same-origin credentials and navigates seven places using history', async () => {
    view = mount(<App />);
    await settle();
    expect(view.div.textContent).toContain('Syntetisk admin');
    expect(get).toHaveBeenCalledWith(
      '/auth/me',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    const links = [...view.div.querySelectorAll('nav[aria-label="Hovudmeny"] a')];
    expect(links.map((a) => a.textContent)).toEqual([
      'I dag',
      'Skjema',
      'Rundar',
      'Kundar',
      'Seminar',
      'Personvern',
      'Innstillingar',
    ]);
    // «Personvern» and «Innstillingar» sit below a line (decision 1 of 17.10).
    expect(view.div.querySelectorAll('nav[aria-label="Hovudmeny"] .nav-skilje')).toHaveLength(1);
    for (const link of links) {
      act(() => {
        (link as HTMLAnchorElement).click();
      });
      expect(window.location.pathname).toBe(link.getAttribute('href'));
      expect(view.div.querySelector('h1')?.textContent).toBe(link.textContent);
      expect(link.getAttribute('aria-current')).toBe('page');
    }
    act(() => {
      window.history.replaceState(null, '', '/admin/rounds');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(view.div.querySelector('h1')?.textContent).toBe('Rundar');
  });
  it('old addresses lead to their new places without a new history entry (2.17)', async () => {
    view = mount(<App />);
    await settle();
    const before = window.history.length;
    for (const [from, to] of [
      ['/admin/export', '/admin/personvern/eksport'],
      ['/admin/deletion', '/admin/personvern/sletting'],
      ['/admin/findings?rule=tryggleik.f8', '/admin/surveys/funn?rule=tryggleik.f8'],
      [
        '/admin/dashboard?round=00000000-0000-4000-8000-000000000001',
        '/admin/rounds/00000000-0000-4000-8000-000000000001/resultat',
      ],
    ] as const) {
      act(() => {
        window.history.replaceState(null, '', from);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await settle();
      expect(window.location.pathname + window.location.search).toBe(to);
    }
    expect(window.history.length).toBe(before);
  });
  it('403 from a protected API shows the Nynorsk access page', async () => {
    get.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ message: 'denied' }), { status: 403 })),
    );
    view = mount(<App />);
    await settle();
    expect(view.div.querySelector('h1')?.textContent).toBe('Du har ikkje tilgang');
    expect(TestStream.streams).toHaveLength(0);
  });
  it('strict mode leaves one live stream, section changes do not open another, unmount closes it', async () => {
    view = mount(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await settle();
    expect(TestStream.streams.filter((s) => !s.closed)).toHaveLength(1);
    act(() => {
      (view!.div.querySelector('a[href="/admin/rounds"]') as HTMLAnchorElement).click();
    });
    expect(TestStream.streams.filter((s) => !s.closed)).toHaveLength(1);
    view.close();
    view = undefined;
    expect(TestStream.streams.every((s) => s.closed)).toBe(true);
  });
});
