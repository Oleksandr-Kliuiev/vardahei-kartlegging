// Placeholder home page of Varde (decision of 13.10): server-rendered HTML in Nynorsk, no SPA,
// no external requests. Visual language of kartlegging: palette, dark theme, Atkinson
// Hyperlegible (used when installed, else a system fallback — no font CDN), narrow column,
// logo, mountain with tent and campfire at the summit. No respondent data.
import { createHash } from 'node:crypto';
import { LOGO_PNG_BASE64 } from './logo.js';

const STYLE = `
:root {
  --bg: #eef2f4; --surface: #f9fbfc; --ink: #1e2a31; --muted: #5d6a71; --line: #c6d1d7;
  --accent: #176e91; --accent-ink: #ffffff; --accent-soft: #dcebf2;
  --fjell: #dde6eb; --fjell-bak: #e6edf1; --sno: #ffffff;
  --telt: #e08a2c; --telt-skugge: #bf6f1d; --eld-1: #e2572b; --eld-2: #f39a2b;
  --font: "Atkinson Hyperlegible", "Segoe UI", system-ui, -apple-system, sans-serif;
  --r: 10px; --logo-filter: none;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #10191e; --surface: #17242b; --ink: #e3eaee; --muted: #9aabb3; --line: #2c3d46;
    --accent: #5fb0d3; --accent-ink: #08161d; --accent-soft: #183544;
    --fjell: #1b2a32; --fjell-bak: #15222a; --sno: #c7d6dd;
    --telt: #e8973c; --telt-skugge: #c47726;
    --logo-filter: brightness(1.45) saturate(.9); color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html, body { min-height: 100%; margin: 0; }
body {
  background: var(--bg); color: var(--ink); font-family: var(--font);
  font-size: 17px; line-height: 1.5; -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 36rem; margin: 0 auto; padding: 14px 18px 64px; }
.logo { display: block; height: 26px; width: auto; filter: var(--logo-filter); }
main { margin-top: 26px; }
.fjell { display: block; width: 100%; height: auto; margin: 8px 0 22px; }
.fjell .bak { fill: var(--fjell-bak); } .fjell .fram { fill: var(--fjell); }
.fjell .sno { fill: var(--sno); } .fjell .telt { fill: var(--telt); }
.fjell .telt-skugge { fill: var(--telt-skugge); }
.fjell .eld-1 { fill: var(--eld-1); } .fjell .eld-2 { fill: var(--eld-2); }
.fjell .tur { fill: var(--muted); } .fjell .sekk { fill: var(--accent); }
h1 { font-size: clamp(2rem, 7vw, 2.6rem); line-height: 1.1; margin: 0 0 10px; letter-spacing: -.01em; }
.merke {
  display: inline-block; background: var(--accent-soft); color: var(--ink); border-radius: 6px;
  padding: 1px 10px; font-weight: 700; font-size: 15px;
}
p { margin: 14px 0; }
.status { color: var(--muted); }
.knapp {
  display: inline-block; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer;
  border: 1px solid var(--line); border-radius: var(--r); padding: 12px 20px;
  background: var(--surface); color: var(--ink);
}
.knapp.hoved { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.knapp:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
form { margin: 0; }
`;

const MOUNTAIN = `<svg class="fjell" viewBox="0 0 360 120" aria-hidden="true" focusable="false">
<path class="bak" d="M0 120 L70 58 L118 86 L186 34 L250 74 L300 50 L360 92 L360 120 Z"/>
<path class="fram" d="M0 120 L96 78 L150 92 L198 40 L240 40 L290 84 L360 104 L360 120 Z"/>
<path class="sno" d="M198 40 L188 51 L197 49 L205 54 L213 48 L222 53 L231 47 L240 40 Z"/>
<path class="telt" d="M202 40 L213 22 L224 40 Z"/><path class="telt-skugge" d="M213 22 L218.5 40 L224 40 Z"/>
<path class="eld-1" d="M232 40 C228 34 232 30 234 25 C236 30 240 34 236 40 Z"/>
<path class="eld-2" d="M233 40 C232 37 233.5 34 234 32 C235.5 35 236 37 235 40 Z"/>
<circle class="tur" cx="171" cy="56" r="3"/><path class="tur" d="M168 60 L174 60 L176 69 L166 69 Z"/>
<path class="sekk" d="M163 60 L168 60 L167 67 L162 67 Z"/>
</svg>`;

/** sha256 of the inline style, for the CSP (no 'unsafe-inline'). */
export const STYLE_HASH = `'sha256-${createHash('sha256').update(STYLE).digest('base64')}'`;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Content-Security-Policy of the page; `formOrigins` — where the logout form may end up. */
export function homeCsp(formOrigins: readonly string[]): string {
  return [
    "default-src 'none'",
    `style-src ${STYLE_HASH}`,
    'img-src data:',
    "base-uri 'none'",
    `form-action 'self'${formOrigins.map((o) => ` ${o}`).join('')}`,
    "frame-ancestors 'none'",
  ].join('; ');
}

export interface HomeView {
  /** null: no valid session; otherwise the name from the session (may itself be null). */
  session: { name: string | null } | null;
}

export function renderHome(view: HomeView): string {
  const action =
    view.session === null
      ? `<p><a class="knapp hoved" href="/auth/login">Logg inn med Microsoft</a></p>`
      : `<p class="status">${
          view.session.name === null
            ? 'Du er logga inn.'
            : `Du er logga inn som <strong>${escapeHtml(view.session.name)}</strong>.`
        }</p>
<form method="post" action="/auth/logout"><button class="knapp" type="submit">Logg ut</button></form>`;
  return `<!doctype html>
<html lang="nn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Varde</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header><img class="logo" alt="Vardahei IT" width="130" height="26" src="data:image/png;base64,${LOGO_PNG_BASE64}"></header>
<main>
${MOUNTAIN}
<h1>Varde</h1>
<span class="merke">Under arbeid</span>
<p>Varde er plattforma for kartlegging hos kundane til Vardahei IT.</p>
${action}
</main>
</div>
</body>
</html>
`;
}
