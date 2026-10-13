// Pages of old kartlegging links (1.7, ADR-009): «avslutta» for a known code, «ikkje gyldig»
// otherwise. Nynorsk with an English line, kartlegging palette and dark theme, no external
// requests; CSP like the home page (style by hash).
import { createHash } from 'node:crypto';

const STYLE = `
:root { --bg: #eef2f4; --surface: #f9fbfc; --ink: #1e2a31; --muted: #5d6a71; --accent: #176e91;
  --font: "Atkinson Hyperlegible", "Segoe UI", system-ui, -apple-system, sans-serif; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #10191e; --surface: #17242b; --ink: #e3eaee; --muted: #9aabb3; --accent: #5fb0d3; color-scheme: dark; }
}
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font); font-size: 17px; line-height: 1.5; }
main { max-width: 36rem; margin: 0 auto; padding: 48px 18px; }
h1 { font-size: clamp(1.6rem, 6vw, 2.2rem); line-height: 1.15; margin: 0 0 12px; }
.en { color: var(--muted); }
`;
const STYLE_HASH = `'sha256-${createHash('sha256').update(STYLE).digest('base64')}'`;

export const LEGACY_CSP = [
  "default-src 'none'",
  `style-src ${STYLE_HASH}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function page(title: string, nn: string, en: string): string {
  return `<!doctype html>
<html lang="nn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${nn}</h1>
<p class="en" lang="en">${en}</p>
</main>
</body>
</html>
`;
}

export const ENDED_PAGE = page(
  'Kartlegginga er avslutta',
  'Kartlegginga er avslutta. Takk for at du ville svare.',
  'The survey has ended. Thank you for wanting to answer.',
);
export const INVALID_PAGE = page(
  'Lenkja er ikkje gyldig',
  'Lenkja er ikkje gyldig',
  'This link is not valid.',
);
