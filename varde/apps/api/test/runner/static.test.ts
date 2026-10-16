import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap.js';
import { RUNNER_CSP } from '../../src/runner/static.js';
import { captureOutput, type Captured } from '../support/capture-output.js';

let app: NestFastifyApplication;
let out: Captured;
const code = randomBytes(16).toString('base64url');
const saved = process.env.VARDE_STATIC_DIR;
const dir = mkdtempSync(resolve(tmpdir(), 'varde-runner-static-'));
beforeAll(async () => {
  const runner = resolve(__dirname, '../../../runner');
  execFileSync(
    process.execPath,
    [resolve(runner, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', dir],
    { cwd: runner, stdio: 'pipe' },
  );
  process.env.VARDE_STATIC_DIR = dir;
  out = captureOutput();
  app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 30_000);
afterAll(async () => {
  await app?.close();
  out?.restore();
  if (saved === undefined) delete process.env.VARDE_STATIC_DIR;
  else process.env.VARDE_STATIC_DIR = saved;
  rmSync(dir, { recursive: true, force: true });
});
const get = (url: string) => app.getHttpAdapter().getInstance().inject({ method: 'GET', url });
function logLines(path: string) {
  return out
    .lines()
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as { path: string; status: number })
    .filter((l) => l.path === path);
}
describe('seminar page (3.2)', () => {
  it('/s and /s/ → the seminar entry of the runner build, same headers, successful access unlogged', async () => {
    for (const path of ['/s', '/s/']) {
      const res = await get(`${path}?c=${code}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('/r/assets/seminar-');
      expect(res.body).not.toContain(code);
      expect(res.headers).toMatchObject({
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
      });
      expect(res.headers['content-security-policy']).toBe(RUNNER_CSP);
      expect(logLines(path)).toEqual([]);
    }
  });
  it('a failed public API call is logged with its path only', async () => {
    const res = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: `/api/public/seminar?c=${code}` });
    expect(res.statusCode).toBe(403);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(logLines('/api/public/seminar')).toEqual([expect.objectContaining({ status: 403 })]);
    expect(out.text()).not.toContain(code);
  });
});
describe('runner static (1.12)', () => {
  it('/r and /r/ → compiled HTML, no-store, security headers, successful access unlogged', async () => {
    for (const path of ['/r', '/r/']) {
      const res = await get(`${path}?c=${code}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('/r/assets/');
      expect(res.headers).toMatchObject({
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
      });
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(logLines(path)).toEqual([]);
    }
  });
  it('only the admin preview may be framed, and only by Varde itself (1.46)', async () => {
    const preview = await get('/r?preview=00000000-0000-4000-8000-000000000000');
    expect(preview.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(preview.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(preview.headers['content-security-policy']).not.toContain("frame-ancestors 'none'");
    for (const url of [`/r?c=${code}`, '/r', '/r/assets/missing.js', `/r/forhand-x?preview=1`]) {
      const res = await get(url);
      expect(res.headers['content-security-policy'], url).toContain("frame-ancestors 'none'");
      expect(res.headers['x-frame-options'], url).toBe('DENY');
    }
  });
  it('missing runner route → 404 with neither query nor code in log/response', async () => {
    const res = await get(`/r/x?c=${code}`);
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(code);
    expect(logLines('/r/x')).toEqual([expect.objectContaining({ status: 404 })]);
    expect(out.text()).not.toContain(code);
  });
  it('assets cache is immutable; Atkinson woff2 is served locally', async () => {
    const files = readdirSync(resolve(dir, 'assets'));
    const fonts = files.filter((f) => f.endsWith('.woff2'));
    expect(fonts.length).toBeGreaterThan(0);
    for (const file of [files.find((f) => f.endsWith('.js'))!, ...fonts]) {
      const res = await get(`/r/assets/${file}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    }
    expect((await get('/r/assets/missing.js')).statusCode).toBe(404);
  });
  it('CSP and compiled HTML/CSS use no external font hosts', async () => {
    const res = await get('/r');
    const css = readdirSync(resolve(dir, 'assets'))
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(resolve(dir, 'assets', f), 'utf8'))
      .join('\n');
    const content = `${res.headers['content-security-policy']}\n${res.body}\n${css}`;
    expect(content).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|https?:\/\//);
    expect(css).toContain('Atkinson Hyperlegible');
  });
  it('path traversal cannot serve source files', async () => {
    for (const path of ['/r/assets/%2e%2e/%2e%2e/package.json', '/r/assets/..%2findex.html']) {
      const result = await get(path);
      expect(result.statusCode).toBe(404);
    }
    expect(out.text()).not.toContain('ForbiddenError');
  });
});
