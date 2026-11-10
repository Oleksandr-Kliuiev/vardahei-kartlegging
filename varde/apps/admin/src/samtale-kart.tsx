// «Alle svar på eitt kart» (2.21, concept): one row per conversation, one cell per question with a narrow
// gap between themes, the score beside the name. A cell is a link to that answer (the conversation at
// that question) and is named in words; the map is one stop for Tab and the arrows move between cells.
// A tip says the rating and the conclusion (or what the client said), on the pointer and on focus.
// «Vis som tabell» gives the same counts per question as a table, the alternative without colour.
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { follow } from './nav.js';
import { RATING, type Overview, type OverviewQuestion } from './samtale-models.js';
import { cellTip, mapColumns, mapRows, word } from './samtale-tal.js';

/** A tip beside the marks with `data-tip` inside `root` («title|line|muted line»), on the pointer and on
 * keyboard focus, as in the concept. Escape hides it; a focused mark is described by it. */
export function Tips({ root }: { root: RefObject<HTMLElement | null> }) {
  const tip = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const box = root.current,
      el = tip.current;
    if (!box || !el) return;
    let current: HTMLElement | null = null;
    const place = (target: HTMLElement) => {
      const r = target.getBoundingClientRect();
      const w = el.offsetWidth,
        h = el.offsetHeight;
      const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
      const top = r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };
    const hide = () => {
      el.hidden = true;
      if (current?.getAttribute('aria-describedby') === id)
        current.removeAttribute('aria-describedby');
      current = null;
    };
    const show = (target: HTMLElement) => {
      if (current && current !== target) hide();
      const [title = '', line = '', more = ''] = (target.dataset['tip'] ?? '').split('|');
      el.replaceChildren();
      for (const [text, tag, cls] of [
        [title, 'b', ''],
        [line, 'span', ''],
        [more, 'span', 'muted'],
      ] as const) {
        if (!text) continue;
        const part = document.createElement(tag);
        part.textContent = text;
        if (cls) part.className = cls;
        el.append(part);
      }
      el.hidden = false;
      current = target;
      if (target.matches('a, button') && !target.hasAttribute('aria-describedby'))
        target.setAttribute('aria-describedby', id);
      place(target);
    };
    const marked = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]');
    const over = (e: PointerEvent) => {
      const t = marked(e);
      if (t && box.contains(t)) show(t);
    };
    const out = (e: PointerEvent) => {
      const t = marked(e);
      if (t && t === current && !t.contains(e.relatedTarget as Node | null)) hide();
    };
    const focus = (e: FocusEvent) => {
      const t = marked(e);
      if (t) show(t);
      else hide();
    };
    const leave = (e: FocusEvent) => {
      if (!box.contains(e.relatedTarget as Node | null)) hide();
    };
    const follow = () => {
      if (current?.isConnected) place(current);
      else hide();
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && current) hide();
    };
    box.addEventListener('pointerover', over);
    box.addEventListener('pointerout', out);
    box.addEventListener('focusin', focus);
    box.addEventListener('focusout', leave);
    window.addEventListener('scroll', follow, { passive: true, capture: true });
    window.addEventListener('resize', follow);
    document.addEventListener('keydown', key);
    return () => {
      hide();
      box.removeEventListener('pointerover', over);
      box.removeEventListener('pointerout', out);
      box.removeEventListener('focusin', focus);
      box.removeEventListener('focusout', leave);
      window.removeEventListener('scroll', follow, { capture: true });
      window.removeEventListener('resize', follow);
      document.removeEventListener('keydown', key);
    };
  }, [root, id]);
  return createPortal(
    <div ref={tip} id={id} className="sm-tips" role="tooltip" hidden />,
    document.body,
  );
}

const STEP: Record<string, [dr: number, dc: number]> = {
  ArrowRight: [0, 1],
  ArrowLeft: [0, -1],
  ArrowDown: [1, 0],
  ArrowUp: [-1, 0],
  Home: [0, 1],
  End: [0, -1],
};

export function Kart({ data, order }: { data: Overview; order: 'svakast' | 'namn' }) {
  const rows = mapRows(data.conversations, order);
  const cols = mapColumns(data.questions);
  const questions = cols.flatMap((c) => (c.gap ? [] : [c.q]));
  const own = new Map(data.rounds.map((r) => [r.id, new Set(r.questions)]));
  const has = (r: number, c: number) =>
    !!own.get(rows[r]?.round.id ?? '')?.has(questions[c]?.id ?? '');
  const twice = new Set(rows.map((r) => r.client.id).filter((id, n, all) => all.indexOf(id) !== n));
  const box = useRef<HTMLDivElement>(null);
  const hint = useId();
  // One cell is in the Tab order (the last one used, else the first); the arrows move from it.
  const [at, setAt] = useState<[number, number]>([0, 0]);
  const first = (() => {
    for (let r = 0; r < rows.length; r++)
      for (let c = 0; c < questions.length; c++) if (has(r, c)) return [r, c] as const;
    return null;
  })();
  const stop = has(at[0], at[1]) ? at : first;
  const columns = ['minmax(110px, 140px)', '34px', ...cols.map((c) => (c.gap ? '6px' : '24px'))];
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = (e.target as HTMLElement).closest<HTMLElement>('a[data-c]');
    const step = STEP[e.key];
    if (!from || !step) return;
    e.preventDefault();
    const [dr, dc] = step;
    const all = e.ctrlKey || e.metaKey;
    let r = Number(from.dataset['r']),
      c = Number(from.dataset['c']);
    // Home and End go to the end of the row (with Ctrl or ⌘ of the map) and look back from there.
    if (e.key === 'Home') [r, c] = [all ? 0 : r, -1];
    if (e.key === 'End') [r, c] = [all ? rows.length - 1 : r, questions.length];
    // Step on until a cell is there: a guide without the question leaves a hole.
    for (;;) {
      r += dr;
      c += dc;
      if (r < 0 || r >= rows.length || c < 0 || c >= questions.length) return;
      const next = box.current?.querySelector<HTMLElement>(`a[data-r="${r}"][data-c="${c}"]`);
      if (next) return next.focus();
    }
  };
  const name = (r: (typeof rows)[number]) =>
    twice.has(r.client.id) ? `${r.client.name} (${r.round.name})` : r.client.name;
  return (
    <div className="tabell-wrap sm-kart-rull" tabIndex={0} role="region" aria-label="Kart over samtalane">
      <p className="sr-only" id={hint}>
        Piltastane flyttar mellom rutene. Enter opnar svaret.
      </p>
      <div
        className="sm-kart"
        ref={box}
        role="group"
        aria-label="Alle svar på eitt kart"
        aria-describedby={hint}
        style={{ gridTemplateColumns: columns.join(' ') }}
        onKeyDown={move}
      >
        <span />
        <span />
        {cols.map((c, n) =>
          c.gap ? (
            <span key={n} className="sm-kart-gap" />
          ) : (
            <span key={n} className="sm-kart-lab" title={`${c.q.section}: ${c.q.short}`}>
              {c.q.short}
            </span>
          ),
        )}
        <span />
        <span className="sm-kart-poeng sm-kart-h">Poeng</span>
        {cols.map((c, n) =>
          c.gap ? (
            <span key={n} className="sm-kart-gap" />
          ) : (
            <span key={n} className="sm-kart-num">
              {c.q.no}
            </span>
          ),
        )}
        {rows.map((row, r) => (
          <Fragment key={row.id}>
            <a
              className="sm-kart-namn"
              href={`/admin/clients/${row.client.id}`}
              title={name(row)}
              onClick={(e) => follow(e, `/admin/clients/${row.client.id}`)}
            >
              {row.client.name}
            </a>
            <span className="sm-kart-poeng tnum">{row.score ?? '–'}</span>
            {cols.map((c, n) => {
              if (c.gap) return <span key={n} className="sm-kart-gap" />;
              const q: OverviewQuestion = c.q;
              const k = questions.indexOf(q);
              if (!has(r, k)) return <span key={n} className="sm-celle sm-celle-utan" />;
              const rating = row.cells[q.id]?.rating ?? null;
              const to = `/admin/samtalar/${row.id}?q=${q.id}`;
              return (
                <a
                  key={n}
                  className={`sm-celle sm-${rating ? RATING[rating].cls : 'tom'}`}
                  href={to}
                  data-r={r}
                  data-c={k}
                  data-tip={cellTip(row, q)}
                  tabIndex={stop?.[0] === r && stop[1] === k ? 0 : -1}
                  aria-label={`${name(row)}, ${q.no} ${q.short}: ${word(rating).toLowerCase()}`}
                  onFocus={() => setAt([r, k])}
                  onClick={(e) => follow(e, to)}
                >
                  {rating ? RATING[rating].glyph : ''}
                </a>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** The counts per question in a table: the map without colour. */
export function SvarTabell({ data }: { data: Overview }) {
  return (
    <div className="tabell-wrap" tabIndex={0} role="region" aria-label="Svar per spørsmål">
      <table className="sm-tabell">
        <thead>
          <tr>
            <th className="r">Nr</th>
            <th>Spørsmål</th>
            <th className="r">Ivaretatt</th>
            <th className="r">Forbetring</th>
            <th className="r">Manglar</th>
            <th className="r">Ikkje aktuelt</th>
            <th className="r">Ikkje vurdert</th>
          </tr>
        </thead>
        <tbody>
          {data.questions.map((q) => (
            <tr key={q.id}>
              <td className="r">{q.no}</td>
              <td>{q.short}</td>
              <td className="r">{q.counts.ivaretatt}</td>
              <td className="r">{q.counts.forbetring}</td>
              <td className="r">{q.counts.manglar}</td>
              <td className="r">{q.counts.ikkje_aktuelt}</td>
              <td className="r">{q.counts.none}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
