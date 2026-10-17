// Small shared pieces of the admin in the Vardestien style: a response ring, a hold-to-confirm button
// and a segmented control.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { countTo } from '@varde/ui/motion';

/** Share of employees who answered; the arc and the number roll to new values. */
export function Ring({ value, max, label }: { value: number; max: number | null; label: string }) {
  const r = 26,
    c = 2 * Math.PI * r;
  const share = max ? Math.min(1, value / max) : 0;
  const text = useRef<SVGTextElement>(null);
  // The number is written only here (not by React), so the rolling count and re-renders never fight over it.
  useEffect(() => {
    const el = text.current;
    if (!el) return;
    if (!max) {
      el.textContent = '–';
      return;
    }
    void countTo(el as unknown as HTMLElement, Math.round(share * 100), {
      format: (v) => `${Math.round(v)} %`,
    });
  }, [share, max]);
  return (
    <svg className="ring" viewBox="0 0 64 64" role="img" aria-label={label}>
      <circle className="bak" cx="32" cy="32" r={r} />
      <circle
        className="fram"
        cx="32"
        cy="32"
        r={r}
        strokeDasharray={c.toFixed(1)}
        strokeDashoffset={(c * (1 - share)).toFixed(1)}
      />
      <text ref={text} x="32" y="37" textAnchor="middle" />
    </svg>
  );
}

/**
 * Irreversible actions run only after the button is held for 1.2 s (mouse, touch, Space or Enter).
 * A short press does nothing except say how it works. The fill shows the real time, also with reduced motion.
 */
export function HoldButton({
  label,
  hint,
  onConfirm,
  disabled,
  className = '',
}: {
  label: string;
  hint: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [held, setHeld] = useState(false);
  const [told, setTold] = useState(false);
  const timer = useRef(0),
    fired = useRef(false);
  const id = useId();
  useEffect(() => () => clearTimeout(timer.current), []);
  const start = () => {
    if (disabled || held) return;
    fired.current = false;
    setHeld(true);
    setTold(false);
    timer.current = window.setTimeout(() => {
      fired.current = true;
      setHeld(false);
      onConfirm();
    }, 1200);
  };
  const stop = () => {
    if (!held) return;
    clearTimeout(timer.current);
    setHeld(false);
    if (!fired.current) setTold(true);
  };
  return (
    <span className="hald-wrap">
      <button
        type="button"
        className={`hald ${className}${held ? ' held' : ''}`}
        disabled={disabled}
        aria-describedby={id}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') stop();
        }}
        onBlur={stop}
      >
        <span className="fyll" aria-hidden="true" />
        <span>{label}</span>
      </button>
      <span
        id={id}
        className={told ? 'hald-hint synleg' : 'hald-hint'}
        role={told ? 'status' : undefined}
      >
        {hint}
      </span>
    </span>
  );
}

/** Segmented control: the thumb glides to the chosen option (token durations, so reduced motion jumps). */
export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  const box = useRef<HTMLDivElement>(null),
    thumb = useRef<HTMLSpanElement>(null),
    placed = useRef(false);
  useLayoutEffect(() => {
    const place = () => {
      const t = thumb.current,
        on = box.current?.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (!t || !on) return;
      if (!placed.current) t.style.transition = 'none';
      t.style.width = `${on.offsetWidth}px`;
      t.style.transform = `translateX(${on.offsetLeft}px)`;
      if (!placed.current) {
        void t.offsetWidth;
        t.style.transition = '';
        placed.current = true;
      }
    };
    place();
    if (typeof ResizeObserver === 'undefined' || !box.current) return;
    const watch = new ResizeObserver(place);
    watch.observe(box.current);
    return () => watch.disconnect();
  }, [value]);
  return (
    <div className="seg" role="group" aria-label={label} ref={box}>
      <span className="seg-thumb" ref={thumb} aria-hidden="true" />
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * A modal panel: while `open`, everything outside `keep` is inert (no focus, no clicks), and focus goes
 * back to `opener` when it closes.
 */
export function useModal(open: boolean, opener: { current: HTMLElement | null }, keep: string) {
  useEffect(() => {
    if (!open) return;
    const rest = [
      ...document.querySelectorAll<HTMLElement>(`#sidemeny, .topplinje, .hopp, ${keep}`),
    ];
    for (const el of rest) el.inert = true;
    return () => {
      for (const el of rest) el.inert = false;
      opener.current?.focus();
    };
  }, [open]);
}
