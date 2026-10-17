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
  register: (title: string) => void;
  setAll: (open: boolean) => void;
}
const Ctx = createContext<FoldState | null>(null);

export function FoldProvider({ children }: { children: ReactNode }) {
  const [closed, setClosed] = useState<Record<string, boolean>>(read);
  const titles = useRef(new Set<string>());
  const apply = (next: Record<string, boolean>) => {
    setClosed(next);
    save(next);
  };
  const state: FoldState = {
    isOpen: (t, start) => (t in closed ? !closed[t] : start),
    toggle: (t, open) => apply({ ...closed, [t]: !open }),
    register: (t) => void titles.current.add(t),
    setAll: (open) => apply(Object.fromEntries([...titles.current].map((t) => [t, !open]))),
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
 * A block of the results. Details (`closed`) start folded so the summary comes first (2.17); a
 * `lazy` block mounts its content when first opened, so rows of answers are read (and logged) only
 * when someone opens them.
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
  fold?.register(title);
  const open = fold ? fold.isOpen(title, !closed) : local;
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
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
        <div className="fold-innhald">{!lazy || seen ? children : null}</div>
      </details>
    </section>
  );
}
