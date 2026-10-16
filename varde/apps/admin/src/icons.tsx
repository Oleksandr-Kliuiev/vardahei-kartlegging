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
  dok: [
    <path key="a" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />,
    <path key="b" d="M14 3v6h6M8 13h8M8 17h5" />,
  ],
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
