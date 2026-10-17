// Admin frame (Vardestien): sidebar with sections, live status and the signed-in person; top line with
// breadcrumbs and theme; ⌘K palette to jump anywhere; toasts. Pages keep their own content.
import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { animate, ease, setTheme } from '@varde/ui/motion';
import { Icon, type IconName } from './icons.js';
import logo from './logo.png';
import { useClients } from './queries.js';

export interface Section {
  url: string;
  label: string;
  icon: IconName;
  group: string;
  /** Page heading and intro when they differ from the menu label (Vardestien «Rapportar»). */
  title?: string;
  intro?: string;
  /** Has pages below its URL (`/admin/reports/<round client>`). */
  sub?: boolean;
}
export const SECTIONS: Section[] = [
  { url: '/admin', label: 'Oversikt', icon: 'heim', group: 'Arbeid' },
  { url: '/admin/rounds', label: 'Kundar og rundar', icon: 'flagg', group: 'Arbeid' },
  { url: '/admin/dashboard', label: 'Dashbord', icon: 'graf', group: 'Arbeid' },
  { url: '/admin/surveys', label: 'Skjema', icon: 'skjema', group: 'Innhald', sub: true },
  { url: '/admin/findings', label: 'Funn', icon: 'lyspare', group: 'Innhald' },
  {
    url: '/admin/seminars',
    label: 'Seminar',
    icon: 'folk',
    group: 'Innhald',
    intro: 'Påmelding, materiell og invitasjon. Varde sender ingenting av seg sjølv.',
    sub: true,
  },
  {
    url: '/admin/reports',
    label: 'Rapportar',
    icon: 'dok',
    group: 'Innhald',
    title: 'Rapport til kunden',
    intro: 'Ein PDF frå publiserte tal, på språket til kunden. Du sjekkar og sender han sjølv.',
    sub: true,
  },
  { url: '/admin/export', label: 'Eksport', icon: 'ned', group: 'Personvern' },
  { url: '/admin/deletion', label: 'Sletting', icon: 'slett', group: 'Personvern' },
];

/** The section of a path; a section may have sub-paths (`/admin/reports/<id>`). */
export function sectionOf(path: string): Section | undefined {
  return (
    SECTIONS.find((s) => s.url === path) ??
    SECTIONS.find((s) => s.sub === true && path.startsWith(`${s.url}/`))
  );
}

/* ---------- Toasts ---------- */
/** An optional action on a toast, for example «Angre» after a deletion; such toasts stay longer. */
export interface ToastAction {
  label: string;
  run: () => void;
}
const ToastContext = createContext<(message: string, action?: ToastAction) => void>(
  () => undefined,
);
export const useToast = () => useContext(ToastContext);
export function Toasts({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; action?: ToastAction }[]>([]);
  const next = useRef(0);
  const show = useCallback((message: string, action?: ToastAction) => {
    const id = ++next.current;
    setItems((list) => [...list, { id, message, ...(action ? { action } : {}) }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), action ? 8000 : 3400);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className="toast"
            ref={(el) => {
              if (el && !el.dataset['inn']) {
                el.dataset['inn'] = '1';
                void animate(
                  el,
                  [
                    { transform: 'translateY(16px) scale(.96)', opacity: 0 },
                    { transform: 'none', opacity: 1 },
                  ],
                  {
                    duration: 520,
                    easing: ease.fjor,
                  },
                );
              }
            }}
          >
            <Icon name="hake" small />
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  t.action!.run();
                  setItems((list) => list.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- Theme ---------- */
type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'varde:tema';
export function storedTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}
function ThemeSwitch() {
  const [theme, set] = useState<Theme>(storedTheme);
  const choose = (t: Theme) => {
    set(t);
    setTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* Theme still applies for this visit. */
    }
  };
  const options: [Theme, IconName, string][] = [
    ['system', 'skjerm', 'Som systemet'],
    ['light', 'sol', 'Lys'],
    ['dark', 'mane', 'Mørk'],
  ];
  return (
    <div className="seg tema" role="group" aria-label="Tema">
      {options.map(([t, icon, label]) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          aria-label={label}
          title={label}
          onClick={() => choose(t)}
        >
          <Icon name={icon} small />
        </button>
      ))}
    </div>
  );
}

/* ---------- Sidebar ---------- */
export function Sidebar({
  path,
  go,
  name,
  connected,
  open,
  onSearch,
  onLogout,
}: {
  path: string;
  go: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
  name: string | null;
  connected: boolean;
  open: boolean;
  onSearch: () => void;
  onLogout: () => void;
}) {
  const nav = useRef<HTMLElement>(null),
    thumb = useRef<HTMLSpanElement>(null),
    placed = useRef(false);
  // The active marker glides to the current section.
  useLayoutEffect(() => {
    const t = thumb.current,
      a = nav.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!t) return;
    if (!a) {
      t.style.opacity = '0';
      return;
    }
    if (!placed.current) t.style.transition = 'none';
    t.style.opacity = '1';
    t.style.height = `${a.offsetHeight}px`;
    t.style.transform = `translateY(${a.offsetTop}px)`;
    if (!placed.current) {
      void t.offsetWidth;
      t.style.transition = '';
      placed.current = true;
    }
  }, [path]);
  const initials = (name ?? 'V')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  return (
    <aside className="sidemeny" id="sidemeny" data-open={open ? 'true' : 'false'}>
      <a className="merke" href="/" aria-label="Varde, heim">
        <span className="logo-plate">
          <img className="logo" src={logo} alt="Vardahei IT" />
        </span>
      </a>
      <div className="produkt">
        <span className="produkt-sub">Kartlegging · seminar · oppfølging</span>
      </div>
      <button type="button" className="sok" onClick={onSearch}>
        <Icon name="sok" small />
        <span>Søk eller hopp til …</span>
        <kbd>⌘K</kbd>
      </button>
      <nav className="nav" aria-label="Hovudmeny" ref={nav}>
        <span className="nav-tommel" ref={thumb} aria-hidden="true" />
        {groups.map((g) => (
          <Fragment key={g}>
            <div className="nav-gruppe">{g}</div>
            {SECTIONS.filter((s) => s.group === g).map((s) => (
              <a
                key={s.url}
                href={s.url}
                aria-current={sectionOf(path) === s ? 'page' : undefined}
                onClick={(e) => go(e, s.url)}
              >
                <Icon name={s.icon} />
                <span>{s.label}</span>
              </a>
            ))}
          </Fragment>
        ))}
      </nav>
      <div className="sidemeny-fot">
        <div className="sanntid" role="status">
          <span className={connected ? 'live-dot' : 'live-dot av'} aria-hidden="true" />
          <span>{connected ? 'Oppdatert i sanntid' : 'Koplar til sanntid …'}</span>
        </div>
        <div className="meg">
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="meg-namn">{name ?? 'Du er logga inn'}</span>
          <button
            type="button"
            className="ikonknapp"
            aria-label="Logg ut"
            title="Logg ut"
            onClick={onLogout}
          >
            <Icon name="loggut" small />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Top line ---------- */
export function Topbar({
  section,
  open,
  onMenu,
}: {
  section: string;
  open: boolean;
  onMenu: () => void;
}) {
  const [shadow, setShadow] = useState(false);
  useEffect(() => {
    const scroll = () => setShadow(window.scrollY > 8);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => window.removeEventListener('scroll', scroll);
  }, []);
  return (
    <header className={shadow ? 'topplinje skuggar' : 'topplinje'}>
      <button
        type="button"
        className="ikonknapp menyknapp"
        aria-label={open ? 'Lukk menyen' : 'Opne menyen'}
        aria-expanded={open}
        aria-controls="sidemeny"
        onClick={onMenu}
      >
        <Icon name={open ? 'lukk' : 'meny'} />
      </button>
      <div className="smular">
        <span>Varde</span>
        <span aria-hidden="true">/</span>
        <b>{section}</b>
      </div>
      <div className="topp-hogre">
        <ThemeSwitch />
      </div>
    </header>
  );
}

/* ---------- ⌘K palette ---------- */
interface Hit {
  label: string;
  hint: string;
  to: string;
  icon: IconName;
}
export function Palette({
  open,
  onClose,
  go,
}: {
  open: boolean;
  onClose: () => void;
  go: (to: string) => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const clients = useClients();
  const box = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    input.current?.focus();
    void animate(
      box.current,
      [
        { opacity: 0, transform: 'translateX(-50%) scale(.97) translateY(-6px)' },
        { opacity: 1, transform: 'translateX(-50%)' },
      ],
      {
        duration: 380,
        easing: ease.fjor,
        fill: 'none',
      },
    );
  }, [open]);
  if (!open) return null;
  const hits: Hit[] = [
    ...SECTIONS.map((s) => ({ label: s.label, hint: 'Side', to: s.url, icon: s.icon })),
    ...(clients.data ?? []).map((c) => ({
      label: c.name,
      hint: 'Kunde',
      to: '/admin/rounds',
      icon: 'flagg' as const,
    })),
  ].filter((h) => h.label.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (h: Hit | undefined) => {
    if (!h) return;
    onClose();
    go(h.to);
  };
  return (
    <>
      <div className="palett-bakgrunn" onClick={onClose} />
      <div className="palett" role="dialog" aria-modal="true" aria-label="Søk og hopp" ref={box}>
        <div className="palett-sok">
          <Icon name="sok" />
          <input
            ref={input}
            type="text"
            value={q}
            placeholder="Skriv ein kunde eller ei side"
            aria-label="Søk"
            aria-controls="palett-liste"
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, hits.length - 1));
              else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0));
              else if (e.key === 'Enter') pick(hits[sel]);
              else if (e.key === 'Escape') onClose();
              else return;
              e.preventDefault();
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palett-liste" id="palett-liste" role="listbox" aria-label="Treff">
          {hits.length === 0 && <li className="palett-tom">Ingen treff</li>}
          {hits.map((h, i) => (
            <li
              key={`${h.hint}:${h.label}`}
              role="option"
              aria-selected={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={() => pick(h)}
            >
              <Icon name={h.icon} small />
              <span>{h.label}</span>
              <small>{h.hint}</small>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
