// Task 1.3: Origin check on state-changing admin requests, session cookie with the __Host- prefix, sliding
// idle window of an Entra session inside its absolute lifetime, no mock issuer in production.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { issuerUrl, sessionIdleSeconds } from '../src/config/auth-config.js';
import { SESSION_COOKIE, sessionCookie } from '../src/modules/auth/cookies.js';
import { originAllowed } from '../src/modules/auth/origin-guard.js';
import { SessionService } from '../src/modules/auth/session.service.js';
import { startApp, type TestApp } from './support/auth-app.js';
import { MemorySessionStore } from './support/memory-session-store.js';

const req = (method: string, url: string, headers: Record<string, string> = {}) =>
  ({ method, url, headers }) as Parameters<typeof originAllowed>[0];

describe('Origin of state-changing requests (1.3)', () => {
  const host = 'varde.vardahei.tech';
  it('a request from another origin to the admin API or the login routes is refused', () => {
    for (const path of ['/api/admin/rounds', '/auth/logout'])
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(
          originAllowed(req(method, path, { origin: 'https://atlas.vardahei.tech', host }), host),
          `${method} ${path}`,
        ).toBe(false);
        expect(originAllowed(req(method, path, { origin: 'null', host }), host)).toBe(false);
        expect(
          originAllowed(
            req(method, path, { origin: 'https://varde.vardahei.tech.evil.test', host }),
            host,
          ),
        ).toBe(false);
      }
  });
  it('the own origin, a request without Origin, safe methods and the public routes pass', () => {
    expect(
      originAllowed(req('POST', '/api/admin/rounds', { origin: `https://${host}`, host }), host),
    ).toBe(true);
    expect(
      originAllowed(
        req('POST', '/api/admin/rounds', {
          origin: 'http://127.0.0.1:3100',
          host: '127.0.0.1:3100',
        }),
        null,
      ),
    ).toBe(true);
    expect(originAllowed(req('POST', '/api/admin/rounds', { host }), host)).toBe(true);
    expect(
      originAllowed(req('GET', '/api/admin/rounds', { origin: 'https://evil.test', host }), host),
    ).toBe(true);
    expect(
      originAllowed(
        req('POST', '/api/runner/submissions', { origin: 'https://evil.test', host }),
        host,
      ),
    ).toBe(true);
    expect(
      originAllowed(
        req('POST', '/api/admin/rounds?x=1', { origin: 'https://evil.test', host }),
        host,
      ),
    ).toBe(false);
  });
  describe('in the app', () => {
    let t: TestApp;
    const saved = { ...process.env };
    beforeAll(async () => {
      t = await startApp({ PUBLIC_URL: 'https://varde.test' });
    });
    afterAll(async () => {
      await t.app.close();
      process.env = { ...saved };
    });
    const post = (url: string, origin?: string) =>
      t.app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: 'POST', url, headers: origin ? { origin } : {} });
    it('403 before the session is looked at; the own origin and no Origin reach the guard (401)', async () => {
      expect((await post('/api/admin/rounds', 'https://atlas.vardahei.tech')).statusCode).toBe(403);
      expect((await post('/api/admin/rounds', 'https://varde.test')).statusCode).toBe(401);
      expect((await post('/api/admin/rounds')).statusCode).toBe(401);
      expect((await post('/auth/logout', 'https://evil.test')).statusCode).toBe(403);
    });
  });
});

describe('session cookie (1.3)', () => {
  it('has the __Host- prefix with Secure and Path=/ and no Domain', () => {
    expect(SESSION_COOKIE.startsWith('__Host-')).toBe(true);
    const flags = sessionCookie(60);
    expect(flags).toMatchObject({ secure: true, path: '/', httpOnly: true, sameSite: 'lax' });
    expect(flags).not.toHaveProperty('domain');
  });
});

describe('a mock issuer is refused in production (1.3)', () => {
  it('VARDE_OIDC_ISSUER with NODE_ENV=production throws; elsewhere it still replaces the issuer', () => {
    expect(() =>
      issuerUrl({ NODE_ENV: 'production', VARDE_OIDC_ISSUER: 'http://127.0.0.1:1' }, 't'),
    ).toThrow(/must not be set/);
    expect(issuerUrl({ NODE_ENV: 'test', VARDE_OIDC_ISSUER: 'http://127.0.0.1:1' }, 't')).toBe(
      'http://127.0.0.1:1',
    );
    expect(issuerUrl({ NODE_ENV: 'production' }, 'tenant')).toBe(
      'https://login.microsoftonline.com/tenant/v2.0',
    );
  });
});

describe('idle window of an Entra session (1.3)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...saved };
  });
  async function setup() {
    process.env.SESSION_TTL_SECONDS = '28800'; // 8 h absolute
    process.env.SESSION_IDLE_SECONDS = '3600'; // 1 h idle
    const store = new MemorySessionStore();
    const sessions = new SessionService(store, 'main');
    const reply = { setCookie: vi.fn() } as never;
    const stored = await sessions.issue(reply, {
      oid: 'o',
      name: 'n',
      via: 'entra',
      expiresAt: new Date(Date.now() + 28800_000),
    });
    const request = {
      cookies: { [SESSION_COOKIE]: 'signed' },
      unsignCookie: () => ({ valid: true, value: stored.sid }),
    } as never;
    return {
      store,
      sessions,
      stored,
      request,
      reply: reply as unknown as { setCookie: ReturnType<typeof vi.fn> },
    };
  }
  const minutes = (m: number) => m * 60_000;

  it('the cookie lives for the absolute lifetime, the stored session for the idle window', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-27T08:00:00Z') });
    const { stored, reply } = await setup();
    expect(stored.expiresAt.getTime()).toBe(Date.now() + minutes(60));
    expect(reply.setCookie.mock.calls[0]?.[2]).toMatchObject({ maxAge: 28800 });
  });
  it('use slides the window; an hour of silence ends the session', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-27T08:00:00Z') });
    const { sessions, request } = await setup();
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(minutes(50));
      expect(await sessions.resolve(request), `after ${(i + 1) * 50} min`).not.toBeNull();
    }
    vi.advanceTimersByTime(minutes(61));
    expect(await sessions.resolve(request)).toBeNull();
  });
  it('it never outlives the absolute lifetime', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-27T08:00:00Z') });
    const { sessions, request, store, stored } = await setup();
    for (let i = 0; i < 9; i++) {
      vi.advanceTimersByTime(minutes(50));
      await sessions.resolve(request);
    }
    expect(store.sessions.get(stored.sid)?.expiresAt.getTime()).toBeLessThanOrEqual(
      stored.createdAt.getTime() + 28800_000,
    );
    vi.advanceTimersByTime(minutes(60));
    expect(await sessions.resolve(request)).toBeNull();
  });
  it('a check that is not use (the ping of an open stream) does not slide the window', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-27T08:00:00Z') });
    const { sessions, request, store } = await setup();
    const extend = vi.spyOn(store, 'extend');
    vi.advanceTimersByTime(minutes(30));
    expect(await sessions.resolve(request, false)).not.toBeNull();
    expect(extend).not.toHaveBeenCalled();
    vi.advanceTimersByTime(minutes(31));
    expect(await sessions.resolve(request, false)).toBeNull();
  });
  it('writes at most once in five minutes; break-glass sessions are not slid', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-27T08:00:00Z') });
    const { sessions, request, store } = await setup();
    const extend = vi.spyOn(store, 'extend');
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(minutes(1));
      await sessions.resolve(request);
    }
    expect(extend).not.toHaveBeenCalled();
    vi.advanceTimersByTime(minutes(2));
    await sessions.resolve(request);
    expect(extend).toHaveBeenCalledTimes(1);
    expect(sessionIdleSeconds({})).toBe(3600);
    expect(() => sessionIdleSeconds({ SESSION_IDLE_SECONDS: '0' })).toThrow();
  });
});
