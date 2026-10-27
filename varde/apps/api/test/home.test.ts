// Placeholder home page GET / (decision of 13.10): without a session → login link; with a valid
// session → the name and logout; the name is HTML-escaped; strict CSP, no external requests.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SessionVia } from '../src/modules/auth/session.store.js';
import { startApp, type TestApp } from './support/auth-app.js';

const saved = { ...process.env };
let t: TestApp;

beforeAll(async () => {
  t = await startApp({ SESSION_SECRET: randomBytes(32).toString('hex') });
});

afterAll(async () => {
  await t.app.close();
  process.env = { ...saved };
});

async function sessionCookie(name: string | null, via: SessionVia = 'entra'): Promise<string> {
  const s = await t.store.create({
    oid: 'o',
    name,
    via,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return t.app.getHttpAdapter().getInstance().signCookie(s.sid);
}

describe('GET / (home placeholder)', () => {
  it('without a session → 200 HTML in Nynorsk with a link to /auth/login', async () => {
    const res = await t.get('/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html; charset=utf-8/);
    expect(res.body).toContain('<html lang="nn">');
    expect(res.body).toContain('Under arbeid');
    expect(res.body).toContain('plattforma for kartlegging hos kundane til Vardahei IT');
    expect(res.body).toMatch(
      /<a class="knapp hoved" href="\/auth\/login">Logg inn med Microsoft<\/a>/,
    );
    expect(res.body).not.toContain('Logg ut');
  });

  it('with a valid session → the name from the session and the logout form', async () => {
    const res = await t.get('/', { '__Host-varde_session': await sessionCookie('Test Admin') });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Du er logga inn som <strong>Test Admin</strong>.');
    expect(res.body).toMatch(/<form method="post" action="\/auth\/logout">/);
    expect(res.body).toContain('Logg ut');
    expect(res.body).not.toContain('href="/auth/login"');
  });

  it('escapes the name', async () => {
    const res = await t.get('/', {
      '__Host-varde_session': await sessionCookie(`<script>alert("x")</script> & 'b'`),
    });
    expect(res.body).not.toContain('<script>');
    expect(res.body).toContain(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;b&#39;',
    );
  });

  it('a forged, revoked or break-glass session counts as no session', async () => {
    const forged = await t.get('/', { '__Host-varde_session': 'not-signed' });
    expect(forged.body).toContain('Logg inn med Microsoft');
    const bg = await t.get('/', { '__Host-varde_session': await sessionCookie('BG', 'break_glass') });
    expect(bg.body).toContain('Logg inn med Microsoft');
    const sid = await sessionCookie('Gone');
    const unsigned = t.app.getHttpAdapter().getInstance().unsignCookie(sid).value ?? '';
    await t.store.revoke(unsigned, new Date());
    expect((await t.get('/', { '__Host-varde_session': sid })).body).toContain('Logg inn med Microsoft');
  });

  it('strict CSP and security headers; no external URLs in the page', async () => {
    const res = await t.get('/');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/style-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).not.toMatch(/https?:\/\//);
    expect(res.body).not.toMatch(/fonts\.googleapis|<script/);
  });
});
