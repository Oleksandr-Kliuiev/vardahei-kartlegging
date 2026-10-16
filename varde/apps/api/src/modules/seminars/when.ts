// Seminar times (3.1): instants in the database, Europe/Oslo on every page, text and calendar
// file. Month and weekday names are written out here: Chromium has no `nn` data for Intl, and
// the server and the page must say the same thing.
const ZONE = 'Europe/Oslo';
export type WhenLang = 'nn' | 'en';

const WEEKDAYS: Record<WhenLang, readonly string[]> = {
  nn: ['sundag', 'måndag', 'tysdag', 'onsdag', 'torsdag', 'fredag', 'laurdag'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const MONTHS: Record<WhenLang, readonly string[]> = {
  nn: [
    'januar',
    'februar',
    'mars',
    'april',
    'mai',
    'juni',
    'juli',
    'august',
    'september',
    'oktober',
    'november',
    'desember',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Offset of Oslo from UTC at `at`, in minutes (+60 in winter, +120 in summer). */
export function osloOffset(at: Date): number {
  const name =
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** The instant of a wall-clock time in Oslo (`2026-11-06`, `09:00`), also across a DST change. */
export function osloInstant(date: string, time: string): Date {
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = wall - osloOffset(new Date(wall)) * 60_000;
  return new Date(wall - osloOffset(new Date(first)) * 60_000);
}

export interface OsloParts {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday */
  weekday: number;
}

export function osloParts(at: Date): OsloParts {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    weekday: SHORT_WEEKDAYS.indexOf(p.weekday ?? 'Sun'),
  };
}

const clock = (time: string, lang: WhenLang) => (lang === 'nn' ? time.replace(':', '.') : time);

/** «torsdag 6. november 2026» / «Thursday 6 November 2026». */
export function dayText(at: Date, lang: WhenLang): string {
  const o = osloParts(at);
  const month = MONTHS[lang][o.month - 1];
  const weekday = WEEKDAYS[lang][o.weekday];
  return lang === 'nn'
    ? `${weekday} ${o.day}. ${month} ${o.year}`
    : `${weekday} ${o.day} ${month} ${o.year}`;
}

/** «torsdag 6. november 2026, kl. 09.00–11.30» / «Thursday 6 November 2026, 09:00–11:30». */
export function whenText(start: Date, end: Date, lang: WhenLang): string {
  const s = osloParts(start),
    e = osloParts(end);
  const at = lang === 'nn' ? 'kl. ' : '';
  if (s.date === e.date)
    return `${dayText(start, lang)}, ${at}${clock(s.time, lang)}–${clock(e.time, lang)}`;
  return `${dayText(start, lang)}, ${at}${clock(s.time, lang)} – ${dayText(end, lang)}, ${at}${clock(e.time, lang)}`;
}
