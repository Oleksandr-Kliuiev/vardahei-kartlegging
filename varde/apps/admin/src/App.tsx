import { SurveysPage } from './surveys-page.js';
import { ExportPage } from './export-page.js';
import { DeletionPage } from './deletion-page.js';
import { ArchiveReminder } from './archive-reminder.js';
import { DashboardPage } from './dashboard-page.js';
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ease, reduced, stagger } from '@varde/ui/motion';
import { api } from './api.js';
import { useEvents } from './events.js';
import { RoundsPage } from './rounds-page.js';
import { ProgressPage } from './progress-page.js';
import { ErrorMessage } from './queries.js';
import { Palette, SECTIONS, Sidebar, Toasts, Topbar } from './shell.js';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } },
  });
}

function Shell({ name }: { name: string | null }) {
  const client = useQueryClient();
  const connected = useEvents(client);
  const [path, setPath] = useState(window.location.pathname.replace(/\/$/, '') || '/admin');
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const page = useRef<HTMLElement>(null);
  useEffect(() => {
    const pop = () => {
      setPath(window.location.pathname.replace(/\/$/, '') || '/admin');
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
    };
  }, []);
  // ⌘K / Ctrl+K opens the palette from anywhere; Esc closes the menu on narrow screens.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
    };
  }, []);
  // A new section enters in reading order; the first view is shown as it is.
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = page.current;
    if (!el || reduced()) return;
    void stagger(
      el.querySelectorAll(':scope > *'),
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: 480,
        step: 45,
        max: 8,
        easing: ease.inn,
        fill: 'backwards',
      },
    );
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [path]);
  const goTo = (to: string) => {
    window.history.pushState(null, '', to);
    setPath(to);
    setMenu(false);
  };
  function navigate(event: MouseEvent<HTMLAnchorElement>, to: string) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goTo(to);
  }
  async function logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', redirect: 'manual' });
    client.clear();
    window.location.assign('/');
  }
  const section = SECTIONS.find((s) => s.url === path);
  return (
    <div className="skal">
      <Sidebar
        path={path}
        go={navigate}
        name={name}
        connected={connected}
        open={menu}
        onSearch={() => setPalette(true)}
        onLogout={() => {
          void logout();
        }}
      />
      {menu && <div className="slor" onClick={() => setMenu(false)} />}
      <div className="hovud">
        <Topbar
          section={section?.label ?? 'Sida finst ikkje'}
          open={menu}
          onMenu={() => setMenu(!menu)}
        />
        <main className="side" ref={page}>
          <div className="sidetittel">
            <h1>{section?.label ?? 'Sida finst ikkje'}</h1>
          </div>
          {path === '/admin' ? (
            <>
              <ArchiveReminder />
              <ProgressPage />
            </>
          ) : path === '/admin/rounds' ? (
            <RoundsPage />
          ) : path === '/admin/surveys' ? (
            <SurveysPage />
          ) : path === '/admin/dashboard' ? (
            <DashboardPage />
          ) : path === '/admin/export' ? (
            <ExportPage />
          ) : path === '/admin/deletion' ? (
            <DeletionPage />
          ) : (
            <section className="del">
              <p>{section ? 'Denne delen kjem snart.' : 'Vel ein del i menyen.'}</p>
            </section>
          )}
        </main>
      </div>
      <Palette open={palette} onClose={() => setPalette(false)} go={goTo} />
    </div>
  );
}

function Session() {
  const [forbidden, setForbidden] = useState(false);
  const me = useQuery({
    queryKey: ['session'],
    queryFn: () => api<{ name: string | null }>('/auth/me'),
  });
  useEffect(() => {
    const deny = () => {
      setForbidden(true);
    };
    window.addEventListener('varde:forbidden', deny);
    return () => {
      window.removeEventListener('varde:forbidden', deny);
    };
  }, []);
  if (forbidden)
    return (
      <main className="ark">
        <h1>Du har ikkje tilgang</h1>
        <p>Kontakt Vardahei IT om du treng tilgang.</p>
      </main>
    );
  if (!me.data)
    return (
      <main className="ark">
        <h1>Varde</h1>
        <ErrorMessage error={me.error} />
        <p>Hentar innlogging …</p>
      </main>
    );
  return (
    <Toasts>
      <Shell name={me.data.name} />
    </Toasts>
  );
}

export function App() {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <Session />
    </QueryClientProvider>
  );
}
