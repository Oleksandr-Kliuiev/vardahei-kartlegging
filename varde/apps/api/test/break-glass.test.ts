// Task 0.8: break-glass only on a Unix socket, bounded window, AuditLog, sessions ≤ 1 h.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { breakGlassHash } from '../src/cli.js';
import { startApp, type TestApp } from './support/auth-app.js';
import { cookiePair, socketRequest } from './support/socket-http.js';

const dir = mkdtempSync(join(tmpdir(), 'varde-bg-'));
const SOCKET = join(dir, 'break-glass.sock');
const saved = { ...process.env };
let password = '';
let hash = '';
let t: TestApp | undefined;

beforeAll(async () => {
  const generated = await breakGlassHash();
  password = generated.password;
  hash = /^VARDE_BREAK_GLASS_PASSWORD_HASH='(.+)'$/.exec(generated.line)?.[1] ?? '';
});

afterEach(async () => {
  vi.useRealTimers();
  await t?.app.close();
  t = undefined;
  process.env = { ...saved };
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function start(env: Record<string, string | undefined>): Promise<TestApp> {
  t = await startApp({
    DATABASE_URL: undefined,
    SESSION_SECRET: randomBytes(32).toString('hex'),
    VARDE_BREAK_GLASS_SOCKET: SOCKET,
    VARDE_BREAK_GLASS_OPERATOR: 'tester',
    ...env,
  });
  return t;
}

const on = (until = iso(3 * 3600_000)) => ({
  VARDE_BREAK_GLASS_UNTIL: until,
  VARDE_BREAK_GLASS_PASSWORD_HASH: hash,
});

const what = (app: TestApp) => app.store.audits.map((a) => a.what);
const login = (pw: string) =>
  socketRequest(SOCKET, 'POST', '/break-glass/login', { json: { password: pw } });

function refused(port: number): Promise<string> {
  return new Promise((resolve) => {
    const s = connect(port, '127.0.0.1');
    s.on('connect', () => {
      s.destroy();
      resolve('connected');
    });
    s.on('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'));
  });
}

/** A process that dies with SIGKILL leaves its socket file behind. */
async function staleSocket(): Promise<void> {
  const child = spawn(process.execPath, [
    '-e',
    `require('net').createServer().listen(${JSON.stringify(SOCKET)}, () => console.log('up'))`,
  ]);
  await new Promise<void>((resolve) => child.stdout.once('data', () => resolve()));
  child.kill('SIGKILL');
  await new Promise((r) => child.once('exit', r));
  expect(statSync(SOCKET).isSocket()).toBe(true);
}

describe('break-glass (0.8)', () => {
  it('off → main listener 404, no socket', async () => {
    const app = await start({});
    expect((await app.post('/break-glass/login')).statusCode).toBe(404);
    expect(existsSync(SOCKET)).toBe(false);
  });

  it('on → main listener still 404; the socket answers; nothing on TCP 3001', async () => {
    const app = await start(on());
    expect((await app.post('/break-glass/login')).statusCode).toBe(404);
    expect((await app.get('/break-glass/login')).statusCode).toBe(404);
    expect((await socketRequest(SOCKET, 'GET', '/health')).status).toBeGreaterThan(0);
    expect(await refused(3001)).toBe('ECONNREFUSED');
  });

  it('right password → cookie and break_glass.login', async () => {
    const app = await start(on());
    const res = await login(password);
    expect(res.status).toBe(200);
    expect(cookiePair(res.setCookie, 'varde_session')).not.toBe('');
    expect(res.setCookie.join(';')).toMatch(/HttpOnly/);
    expect(what(app)).toContain('break_glass.login');
    expect(app.store.audits.find((a) => a.what === 'break_glass.login')?.who).toBe(
      'break-glass:tester',
    );
    const me = await socketRequest(SOCKET, 'GET', '/auth/me', {
      cookie: cookiePair(res.setCookie, 'varde_session'),
    });
    expect(me.status).toBe(200);
    expect(JSON.parse(me.body)).toMatchObject({ via: 'break_glass' });
  });

  it('wrong password → 401 and break_glass.login_failed', async () => {
    const app = await start(on());
    const res = await login('wrong');
    expect(res.status).toBe(401);
    expect(res.setCookie).toEqual([]);
    expect(what(app)).toContain('break_glass.login_failed');
  });

  it('the session ends after 1 h (fake clock) → 401', async () => {
    await start(on());
    const cookie = cookiePair((await login(password)).setCookie, 'varde_session');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3600_000 + 1000);
    expect((await socketRequest(SOCKET, 'GET', '/auth/me', { cookie })).status).toBe(401);
  });

  it('UNTIL reached on a running process → socket closed, sessions revoked, break_glass.closed', async () => {
    const app = await start(on(iso(1500)));
    const res = await login(password);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 2200));
    expect(existsSync(SOCKET)).toBe(false);
    await expect(socketRequest(SOCKET, 'GET', '/health')).rejects.toThrow();
    expect([...app.store.sessions.values()].every((s) => s.revokedAt !== null)).toBe(true);
    expect(what(app)).toContain('break_glass.closed');
  });

  it('UNTIL in the past → off', async () => {
    const app = await start(on(iso(-60_000)));
    expect(existsSync(SOCKET)).toBe(false);
    expect(what(app)).toEqual([]);
  });

  it('UNTIL beyond 4 h → not enabled, break_glass.rejected', async () => {
    const app = await start(on(iso(4 * 3600_000 + 60_000)));
    expect(existsSync(SOCKET)).toBe(false);
    expect(what(app)).toEqual(['break_glass.rejected']);
    expect(app.store.audits[0]?.details).toHaveProperty('until');
  });

  it.each(['4h', 'abc', '0', '-1', '5'])(
    'BREAK_GLASS_MAX_HOURS=%s → not enabled, rejected bad_max_hours',
    async (max) => {
      const app = await start({ ...on(iso(30 * 60_000)), BREAK_GLASS_MAX_HOURS: max });
      expect(existsSync(SOCKET)).toBe(false);
      expect(app.store.audits[0]).toMatchObject({
        what: 'break_glass.rejected',
        details: { reason: 'bad_max_hours' },
      });
    },
  );

  it('off at start removes a stale socket left by an earlier window', async () => {
    await staleSocket();
    await start({});
    expect(existsSync(SOCKET)).toBe(false);
  });

  it('a hash without $argon2id$ (mangled by Compose) → not enabled, rejected bad_hash', async () => {
    const app = await start({ ...on(), VARDE_BREAK_GLASS_PASSWORD_HASH: '=19=19456,t=2,p=1' });
    expect(existsSync(SOCKET)).toBe(false);
    expect(app.store.audits[0]).toMatchObject({
      what: 'break_glass.rejected',
      details: { reason: 'bad_hash' },
    });
  });

  it('a break-glass cookie on the main listener → 401', async () => {
    const app = await start(on());
    const cookie = cookiePair((await login(password)).setCookie, 'varde_session');
    const [name, value] = cookie.split('=');
    expect(
      (await app.get('/auth/me', { [name ?? '']: decodeURIComponent(value ?? '') })).statusCode,
    ).toBe(401);
  });

  it('AuditLog failure at login → no session', async () => {
    const app = await start(on());
    app.store.failAudit = true;
    const res = await login(password);
    expect(res.status).toBe(503);
    expect(res.setCookie).toEqual([]);
    expect(app.store.sessions.size).toBe(0);
  });

  it('break_glass.enabled is written once at start, with until and operator', async () => {
    const app = await start(on());
    await login('wrong');
    const enabled = app.store.audits.filter((a) => a.what === 'break_glass.enabled');
    expect(enabled).toHaveLength(1);
    expect(enabled[0]?.details).toMatchObject({ operator: 'tester' });
  });

  it('a stale socket file does not block the start; the socket mode is 0660', async () => {
    await staleSocket();
    await start(on());
    expect(statSync(SOCKET).mode & 0o777).toBe(0o660);
    expect((await login(password)).status).toBe(200);
  });
});
