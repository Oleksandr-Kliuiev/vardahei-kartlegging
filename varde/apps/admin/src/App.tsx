import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ease, reduced, stagger } from '@varde/ui/motion';
import { api } from './api.js';
import { useEvents } from './events.js';
import { ErrorMessage } from './queries.js';
import { resolve } from './routes.js';
import { Palette, Sidebar, Toasts, Topbar, sectionOf } from './shell.js';
import './rom.css';

const NAV_KEY = 'varde:meny';
function storedNavClosed(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) === 'closed';
  } catch {
    return false;
  }
}
function storeNavClosed(closed: boolean) {
  try {
    localStorage.setItem(NAV_KEY, closed ? 'closed' : 'open');
  } catch {
    /* The choice still holds for this visit. */
  }
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } },
  });
}

function Shell({ name }: { name: string | null }) {
  const client = useQueryClient();
  const connected = useEvents(client);
  const where = () => ({
    path: window.location.pathname.replace(/\/$/, '') || '/admin',
    search: window.location.search,
  });
  const [{ path, search }, setWhere] = useState(where);
  // Narrow screen: the menu is a drawer. Wide screen: the same button hides and shows the sidebar.
  const [menu, setMenu] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia?.('(min-width: 861px)').matches ?? true);
  const [collapsed, setCollapsed] = useState(storedNavClosed);
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 861px)');
    if (!query) return;
    const change = () => {
      setWide(query.matches);
      if (query.matches) setMenu(false);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [menu]);
  const toggleMenu = () => {
    if (!wide) return setMenu(!menu);
    setCollapsed(!collapsed);
    storeNavClosed(!collapsed);
  };
  const [palette, setPalette] = useState(false);
  const main = useRef<HTMLElement>(null);
  // A layout effect, so the listener is there before any page's effect moves an old address on.
  useLayoutEffect(() => {
    const pop = () => {
      setWhere(where());
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
  // A new place enters in reading order; the first view is shown as it is, and moving between the
  // views of one round or of «Personvern» keeps the page still.
  const place = path.replace(/^(\/admin\/(?:rounds\/[0-9a-f-]{36}|personvern))\/.*$/i, '$1');
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = main.current;
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
  }, [place]);
  const goTo = (to: string) => {
    window.history.pushState(null, '', to);
    setWhere(where());
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
  const section = sectionOf(path);
  const page = resolve(path, search);
  // One title per page for the tab, history and screen readers; pages with their own heading set it.
  useEffect(() => {
    if (page.heading) document.title = `${page.heading.doc ?? page.heading.title} – Varde`;
  }, [path, page.heading?.title, page.heading?.doc]);
  return (
    <div className="skal" data-nav={wide && collapsed ? 'closed' : 'open'}>
      <a className="hopp" href="#innhald">
        Hopp til innhald
      </a>
      <Sidebar
        path={path}
        go={navigate}
        name={name}
        connected={connected}
        open={menu}
        onClose={() => setMenu(false)}
        onSearch={() => setPalette(true)}
        onLogout={() => {
          void logout();
        }}
      />
      {menu && <div className="slor" onClick={() => setMenu(false)} />}
      <div className="hovud">
        <Topbar
          section={section?.label ?? 'Sida finst ikkje'}
          open={wide ? !collapsed : menu}
          onMenu={toggleMenu}
        />
        <main className={page.wide ? 'side side-vid' : 'side'} id="innhald" ref={main}>
          {page.heading && (
            <div className="sidetittel">
              <div>
                <h1>{page.heading.title}</h1>
                {page.heading.intro && <p>{page.heading.intro}</p>}
              </div>
            </div>
          )}
          {page.element}
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
