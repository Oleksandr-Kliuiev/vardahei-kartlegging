import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

/** Collapsible dashboard blocks; the choice is remembered in this browser (never needed for the page to work). */
const KEY = 'varde:dash-fold';
const read = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};
const save = (closed: Record<string, boolean>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(closed));
  } catch {
    /* Private window or blocked storage: the blocks still fold for this visit. */
  }
};

interface FoldState {
  /** A block nobody has folded or opened yet starts as `start`. */
  isOpen: (title: string, start: boolean) => boolean;
  toggle: (title: string, open: boolean) => void;
  register: (title: string, lazy: boolean) => void;
  setAll: (open: boolean) => void;
}
const Ctx = createContext<FoldState | null>(null);

export function FoldProvider({ children }: { children: ReactNode }) {
  const [closed, setClosed] = useState<Record<string, boolean>>(read);
  // Blocks of rows (2.17) open for this visit only: a later visit never reads (and logs) them by itself.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const titles = useRef(new Set<string>()),
    lazy = useRef(new Set<string>());
  const apply = (next: Record<string, boolean>) => {
    const kept = Object.fromEntries(Object.entries(next).filter(([t]) => !lazy.current.has(t)));
    setClosed(kept);
    save(kept);
  };
  const state: FoldState = {
    isOpen: (t, start) =>
      lazy.current.has(t) ? opened.has(t) : t in closed ? !closed[t] : start,
    toggle: (t, open) => {
      if (!lazy.current.has(t)) return apply({ ...closed, [t]: !open });
      const next = new Set(opened);
      if (open) next.add(t);
      else next.delete(t);
      setOpened(next);
    },
    register: (t, isLazy) => {
      titles.current.add(t);
      if (isLazy) lazy.current.add(t);
    },
    setAll: (open) => {
      apply(Object.fromEntries([...titles.current].map((t) => [t, !open])));
      setOpened(new Set(open ? [...lazy.current] : []));
    },
  };
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

/** «Fold alle» / «Opne alle» above the blocks. */
export function FoldAll() {
  const fold = useContext(Ctx);
  if (!fold) return null;
  return (
    <span className="knappar fold-alle">
      <button
        type="button"
        onClick={() => {
          fold.setAll(false);
        }}
      >
        Fold alle
      </button>
      <button
        type="button"
        onClick={() => {
          fold.setAll(true);
        }}
      >
        Opne alle
      </button>
    </span>
  );
}

/**
 * A block of the results. Details (`closed`) start folded so the summary comes first (2.17). A
 * `lazy` block holds rows of answers: its content is there only while it is open, so the rows are
 * read (and logged) only when someone opens it, never again while it is folded, and every visit
 * starts with it folded.
 */
export function Fold({
  title,
  closed = false,
  lazy = false,
  children,
}: {
  title: string;
  closed?: boolean;
  lazy?: boolean;
  children: ReactNode;
}) {
  const fold = useContext(Ctx);
  const [local, setLocal] = useState(!closed);
  fold?.register(title, lazy);
  const open = fold ? fold.isOpen(title, !closed) : local;
  return (
    <section className="del fold">
      <details
        open={open}
        onToggle={(e) => {
          const now = e.currentTarget.open;
          if (now === open) return;
          if (fold) fold.toggle(title, now);
          else setLocal(now);
        }}
      >
        <summary>
          <h2>{title}</h2>
        </summary>
        <div className="fold-innhald">{!lazy || open ? children : null}</div>
      </details>
    </section>
  );
}
