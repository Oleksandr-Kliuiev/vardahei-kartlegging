// When a presenter key works (3.4, ADR-008: «день семинара ± 1»): from 00:00 the day before the
// seminar starts until 24:00 the day after it ends, wall clock in Europe/Oslo (also across a
// daylight saving change). Computed from the seminar's current dates: a moved seminar moves the
// window with it. The participant link of the live poll expires at the same moment.
import { dayText, osloInstant, osloParts, type WhenLang } from '../seminars/when.js';

const shift = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export interface PresenterWindow {
  from: Date;
  /** Exclusive: the first instant the key no longer works. */
  to: Date;
}

export function presenterWindow(s: { starts_at: Date; ends_at: Date }): PresenterWindow {
  return {
    from: osloInstant(shift(osloParts(s.starts_at).date, -1), '00:00'),
    to: osloInstant(shift(osloParts(s.ends_at).date, 2), '00:00'),
  };
}

export function inWindow(s: { starts_at: Date; ends_at: Date }, now = new Date()): boolean {
  const w = presenterWindow(s);
  return now >= w.from && now < w.to;
}

/** «frå onsdag 4. november 2099 til og med fredag 6. november 2099». */
export function windowText(w: PresenterWindow, lang: WhenLang = 'nn'): string {
  const last = new Date(w.to.getTime() - 3600_000);
  return lang === 'nn'
    ? `frå ${dayText(w.from, lang)} til og med ${dayText(last, lang)}`
    : `from ${dayText(w.from, lang)} to ${dayText(last, lang)}`;
}
