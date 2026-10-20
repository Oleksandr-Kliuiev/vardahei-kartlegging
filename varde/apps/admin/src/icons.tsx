// Line icons from the Vardestien reference (24×24, stroke = currentColor; styled by .icon in @varde/ui/base.css).
import type { ReactElement } from 'react';

const P = {
  heim: [<path key="a" d="M3 11l9-7 9 7" />, <path key="b" d="M5 10v10h14V10" />],
  flagg: [<path key="a" d="M5 21V4" />, <path key="b" d="M5 4h11l-2 4 2 4H5" />],
  graf: [<path key="a" d="M4 20V10M10 20V4M16 20v-7M22 20H2" />],
  skjema: [
    <rect key="a" x="5" y="3" width="14" height="18" rx="2" />,
    <path key="b" d="M9 8h6M9 12h6M9 16h4" />,
  ],
  las: [
    <rect key="a" x="5" y="11" width="14" height="10" rx="2" />,
    <path key="b" d="M8 11V7a4 4 0 018 0v4" />,
  ],
  slett: [<path key="a" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />],
  ned: [<path key="a" d="M12 4v12M7 11l5 5 5-5M5 20h14" />],
  sok: [<circle key="a" cx="11" cy="11" r="7" />, <path key="b" d="M20 20l-3.5-3.5" />],
  sidepanel: [
    <rect key="a" x="3" y="4" width="18" height="16" rx="2" />,
    <path key="b" d="M9 4v16" />,
  ],
  meny: [<path key="a" d="M4 7h16M4 12h16M4 17h16" />],
  lukk: [<path key="a" d="M6 6l12 12M18 6L6 18" />],
  loggut: [<path key="a" d="M15 4h4v16h-4" />, <path key="b" d="M10 8l-4 4 4 4M6 12h10" />],
  sol: [
    <circle key="a" cx="12" cy="12" r="4" />,
    <path
      key="b"
      d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
    />,
  ],
  mane: [<path key="a" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />],
  skjerm: [
    <rect key="a" x="2" y="4" width="20" height="13" rx="2" />,
    <path key="b" d="M8 21h8M12 17v4" />,
  ],
  hake: [<path key="a" d="M5 12.5l4.5 4.5L19 7.5" />],
  info: [<circle key="a" cx="12" cy="12" r="9" />, <path key="b" d="M12 8h.01M11 12h1v5h1" />],
  varsel: [
    <path key="a" d="M12 9v4M12 17h.01" />,
    <path key="b" d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />,
  ],
  pil: [<path key="a" d="M5 12h14M13 6l6 6-6 6" />],
  lyspare: [
    <path key="a" d="M9.5 18h5M10.5 21h3" />,
    <path
      key="b"
      d="M12 3a6 6 0 00-3.6 10.8c.7.6 1.1 1.4 1.1 2.3V16h5v-.1c0-.9.4-1.7 1.1-2.3A6 6 0 0012 3z"
    />,
  ],
  dok: [
    <path key="a" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />,
    <path key="b" d="M14 3v6h6M8 13h8M8 17h5" />,
  ],
  // Live questions (3b)
  stopp: [<circle key="a" cx="12" cy="12" r="9" />, <path key="b" d="M9 9h6v6H9z" />],
  oppdater: [<path key="a" d="M20 11a8 8 0 10-2.3 5.7" />, <path key="b" d="M20 4v7h-7" />],
  start: [<circle key="a" cx="12" cy="12" r="9" />, <path key="b" d="M10 8.5l5 3.5-5 3.5z" />],
  // Seminar (3a)
  folk: [
    <circle key="a" cx="9" cy="8" r="3" />,
    <path key="b" d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />,
    <circle key="c" cx="17" cy="9" r="2.5" />,
    <path key="d" d="M15.5 14.2c3 .2 5.5 2.7 5.5 5.8" />,
  ],
  kalender: [
    <rect key="a" x="3" y="5" width="18" height="16" rx="2" />,
    <path key="b" d="M3 10h18M8 3v4M16 3v4" />,
  ],
  kopi: [
    <rect key="a" x="9" y="9" width="12" height="12" rx="2" />,
    <path key="b" d="M5 15V5a2 2 0 012-2h10" />,
  ],
  pluss: [<path key="a" d="M12 5v14M5 12h14" />],
  tilbake: [<path key="a" d="M19 12H5M11 6l-6 6 6 6" />],
  // Seminar rounds (3.8): the survey after the seminar
  send: [<path key="a" d="M22 2L11 13" />, <path key="b" d="M22 2l-7 20-4-9-9-4z" />],
  // Survey workshop (2.15)
  grep: [
    <circle key="a" cx="9" cy="6" r=".6" />,
    <circle key="b" cx="15" cy="6" r=".6" />,
    <circle key="c" cx="9" cy="12" r=".6" />,
    <circle key="d" cx="15" cy="12" r=".6" />,
    <circle key="e" cx="9" cy="18" r=".6" />,
    <circle key="f" cx="15" cy="18" r=".6" />,
  ],
  greiner: [
    <path key="a" d="M6 3v12" />,
    <circle key="b" cx="6" cy="18" r="3" />,
    <circle key="c" cx="18" cy="6" r="3" />,
    <path key="d" d="M18 9a9 9 0 01-9 9" />,
  ],
  angre: [<path key="a" d="M9 14L4 9l5-5" />, <path key="b" d="M4 9h10.5a5.5 5.5 0 010 11H11" />],
  gjerom: [<path key="a" d="M15 14l5-5-5-5" />, <path key="b" d="M20 9H9.5a5.5 5.5 0 000 11H13" />],
  telefon: [
    <rect key="a" x="7" y="2" width="10" height="20" rx="2" />,
    <path key="b" d="M11 18h2" />,
  ],
  sprak: [
    <circle key="a" cx="12" cy="12" r="9" />,
    <path key="b" d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />,
  ],
  chev: [<path key="a" d="M9 6l6 6-6 6" />],
  topp: [
    <path key="a" d="M3 20l6.5-11 4 6.5 2.5-4L21 20z" />,
    <path key="b" d="M9.5 9V4l4 1.6-4 1.6" />,
  ],
  leiar: [
    <circle key="a" cx="12" cy="7" r="3.5" />,
    <path key="b" d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />,
  ],
  tannhjul: [
    <circle key="a" cx="12" cy="12" r="3" />,
    <path
      key="b"
      d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"
    />,
  ],
  // Notes on questions in the workshop (2.18).
  prat: [
    <path
      key="a"
      d="M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2h-7l-4.5 3.5V17H5a2 2 0 01-2-2V7a2 2 0 012-2z"
    />,
  ],
  // «Kundar» and «Personvern» in the menu (2.17).
  bygg: [
    <path key="a" d="M4 21V5.5L12 3v18M12 9l8 2.5V21M2 21h20" />,
    <path key="b" d="M7.5 8.5h1.5M7.5 12.5h1.5M7.5 16.5h1.5M15.5 14h1.5M15.5 17.5h1.5" />,
  ],
  skjold: [
    <path key="a" d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6L12 3z" />,
    <path key="b" d="M9 12l2.2 2.2L15.5 10" />,
  ],
  t_single: [
    <circle key="a" cx="12" cy="12" r="8.5" />,
    <circle key="b" cx="12" cy="12" r="3.2" />,
  ],
  t_multi: [
    <rect key="a" x="3.5" y="3.5" width="17" height="17" rx="3.5" />,
    <path key="b" d="M8 12.3l2.8 2.8L16.2 9.5" />,
  ],
  t_scale: [
    <path key="a" d="M3 12h18" />,
    <circle key="b" cx="6.5" cy="12" r="2" />,
    <circle key="c" cx="12" cy="12" r="2" />,
    <circle key="d" cx="17.5" cy="12" r="2" />,
  ],
  t_nps: [
    <rect key="a" x="3" y="7" width="5" height="10" rx="1.4" />,
    <rect key="b" x="9.5" y="7" width="5" height="10" rx="1.4" />,
    <rect key="c" x="16" y="7" width="5" height="10" rx="1.4" />,
  ],
  t_text: [<path key="a" d="M4 7h16M4 12h11M4 17h14" />],
} satisfies Record<string, ReactElement[]>;
export type IconName = keyof typeof P;

export function Icon({ name, small }: { name: IconName; small?: boolean }) {
  return (
    <svg
      className={small ? 'icon sm' : 'icon'}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  );
}
