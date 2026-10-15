// Line icons from the Vardestien reference (24×24, stroke = currentColor; styled by .icon in @varde/ui/base.css).
import type { JSX } from 'preact';

const PATHS = {
  klokke: [<circle cx="12" cy="12" r="9" />, <path d="M12 7v5l3 2" />],
  hake: [<path d="M5 12.5l4.5 4.5L19 7.5" />],
  skjold: [
    <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />,
    <path d="M9 12l2 2 4-4" />,
  ],
  ned: [<path d="M6 9l6 6 6-6" />],
  pil: [<path d="M5 12h14M13 6l6 6-6 6" />],
  fram: [<path d="M9 6l6 6-6 6" />],
  bak: [<path d="M15 18l-6-6 6-6" />],
  auge: [
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />,
    <circle cx="12" cy="12" r="3" />,
  ],
  varsel: [
    <path d="M12 9v4M12 17h.01" />,
    <path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />,
  ],
  lenke: [
    <path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" />,
    <path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" />,
  ],
  mane: [<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />],
} satisfies Record<string, JSX.Element[]>;
export type IconName = keyof typeof PATHS;

export function Icon({ name, small }: { name: IconName; small?: boolean }) {
  return (
    <svg
      class={small ? 'icon sm' : 'icon'}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Small cairn mark for section headings. */
export function CairnMark() {
  return (
    <svg class="varde-merke" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M2.6 15h10.8l-.5-3.1H3.2zM3.6 11.4h8.6l-.5-2.6H4.1zM4.6 8.3h6.7l-.4-2.4H5zM5.6 5.4h4.6l-.4-2H6z"
        fill="currentColor"
        opacity=".55"
      />
      <path d="M6.5 2.9h3l-.4-1.6H6.9z" fill="currentColor" />
    </svg>
  );
}
