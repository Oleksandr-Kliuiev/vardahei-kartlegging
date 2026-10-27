import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp, type TestApp } from '../support/auth-app.js';

let t: TestApp, cookies: Record<string, string>;
const saved = { ...process.env },
  dir = mkdtempSync(resolve(tmpdir(), 'varde-admin-static-'));
beforeAll(async () => {
  const admin = resolve(__dirname, '../../../admin');
  execFileSync(
    process.execPath,
    [resolve(admin, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', dir],
    { cwd: admin, stdio: 'pipe' },
  );
  t = await startApp({ VARDE_ADMIN_STATIC_DIR: dir });
  const session = await t.store.create({
    oid: 'test.static',
    name: 'test',
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  cookies = { '__Host-varde_session': t.app.getHttpAdapter().getInstance().signCookie(session.sid) };
});
afterAll(async () => {
  await t.app?.close();
  rmSync(dir, { recursive: true, force: true });
  process.env = saved;
});

describe('protected admin SPA (1.23)', () => {
  it('HTML redirects to login without a session; assets require session', async () => {
    for (const path of ['/admin', '/admin/rounds']) {
      const result = await t.get(path);
      expect(result.statusCode).toBe(302);
      expect(result.headers.location).toBe('/auth/login');
    }
    const asset = readdirSync(resolve(dir, 'assets'))[0]!;
    expect((await t.get(`/admin/assets/${asset}`)).statusCode).toBe(401);
  });
  it('all History API routes use the built index and unchanged restrictive CSP', async () => {
    for (const path of [
      '/admin',
      '/admin/',
      '/admin/rounds',
      '/admin/dashboard',
      '/admin/export',
      '/admin/deletion',
    ]) {
      const res = await t.get(path, cookies);
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('/admin/assets/');
      expect(res.headers).toMatchObject({
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
      });
      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("font-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toMatch(/https?:|unsafe-inline|unsafe-eval/);
    }
  });
  it('local fonts and logo are real assets; missing or traversal assets never use SPA fallback', async () => {
    const files = readdirSync(resolve(dir, 'assets'));
    expect(files.some((f) => f.endsWith('.woff2'))).toBe(true);
    expect(files.some((f) => f.endsWith('.png'))).toBe(true);
    for (const file of files)
      expect((await t.get(`/admin/assets/${file}`, cookies)).statusCode).toBe(200);
    for (const path of [
      '/admin/assets/missing.js',
      '/admin/assets/..%2findex.html',
      '/admin/assets/%2e%2e/package.json',
    ])
      expect((await t.get(path, cookies)).statusCode).toBe(404);
    const css = files
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(resolve(dir, 'assets', f), 'utf8'))
      .join('\n');
    expect(css).toContain('Atkinson Hyperlegible');
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\//);
  });
  it('revocation denies a previously authenticated document request', async () => {
    const session = await t.store.create({
      oid: 'test.revoke',
      name: null,
      via: 'entra',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const signed = { '__Host-varde_session': t.app.getHttpAdapter().getInstance().signCookie(session.sid) };
    expect((await t.get('/admin', signed)).statusCode).toBe(200);
    await t.store.revoke(session.sid, new Date());
    expect((await t.get('/admin', signed)).statusCode).toBe(302);
  });
});
