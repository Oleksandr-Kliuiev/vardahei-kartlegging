// Task 0.7: Entra OIDC against the mock issuer (signed client assertion), server-side sessions.
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NOT_MEMBER_TEXT } from '../src/modules/auth/auth.controller.js';
import { rawSetCookie, setCookie, startApp, type TestApp } from './support/auth-app.js';
import { clientCertificate, MockOidc, type Scenario } from './support/mock-oidc.js';

const GROUP = '00000000-0000-4000-8000-00000000a0a0';
const cert = clientCertificate();
const mock = new MockOidc(cert.certFile);
const saved = { ...process.env };
const SECRET = randomBytes(32).toString('hex');
let t: TestApp;

function entraEnv(): Record<string, string> {
  return {
    ENTRA_TENANT_ID: mock.tenant,
    ENTRA_CLIENT_ID: mock.clientId,
    ENTRA_CLIENT_KEY_FILE: cert.keyFile,
    ENTRA_CLIENT_CERT_FILE: cert.certFile,
    VARDE_ADMIN_GROUP_ID: GROUP,
    SESSION_SECRET: SECRET,
    SESSION_TTL_SECONDS: '28800',
    PUBLIC_URL: 'https://varde.test',
    VARDE_OIDC_ISSUER: mock.issuer,
  };
}

beforeAll(async () => {
  await mock.start();
  t = await startApp(entraEnv());
});

afterAll(async () => {
  await t.app.close();
  await mock.stop();
  process.env = { ...saved };
  rmSync(cert.dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
});

/** /auth/login → mock /authorize → callback path; returns what the callback needs. */
async function startLogin(scenario: Scenario): Promise<{ oidc: string; callback: string }> {
  mock.scenario = scenario;
  const login = await t.get('/auth/login');
  expect(login.statusCode).toBe(302);
  const oidc = setCookie(login, 'varde_oidc') ?? '';
  const auth = await fetch(String(login.headers.location), { redirect: 'manual' });
  const back = new URL(auth.headers.get('location') ?? '');
  return { oidc, callback: `${back.pathname}${back.search}` };
}

async function login(scenario: Scenario) {
  const { oidc, callback } = await startLogin(scenario);
  return t.get(callback, { varde_oidc: oidc });
}

async function memberSession(): Promise<string> {
  const res = await login({ groups: [GROUP] });
  expect(res.statusCode).toBe(302);
  return setCookie(res, '__Host-varde_session') ?? '';
}

describe('Entra login (0.7)', () => {
  it('member → 302 to /, session cookie HttpOnly; Secure; SameSite=Lax; signed assertion with x5t#S256', async () => {
    const before = mock.assertions.length;
    const res = await login({ groups: ['other', GROUP] });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    const cookie = rawSetCookie(res, '__Host-varde_session');
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    const a = mock.assertions.at(-1);
    expect(mock.assertions.length).toBe(before + 1);
    expect(a?.header.alg).toBe('RS256');
    expect(typeof a?.header['x5t#S256']).toBe('string');
    expect(a?.payload.aud).toBe(mock.tokenEndpoint);
    const me = await t.get('/auth/me', { '__Host-varde_session': setCookie(res, '__Host-varde_session') ?? '' });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ name: 'Test Admin', via: 'entra' });
  });

  it('not a member → 403 with a short Nynorsk text', async () => {
    const res = await login({ groups: ['someone-else'] });
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe(NOT_MEMBER_TEXT);
    expect(setCookie(res, '__Host-varde_session')).toBeUndefined();
  });

  it('token without groups (overage, _claim_names) → 403', async () => {
    const res = await login({ claimNames: true });
    expect(res.statusCode).toBe(403);
  });

  it('callback with a foreign state → 400, no session', async () => {
    const sessions = t.store.sessions.size;
    const { oidc, callback } = await startLogin({ groups: [GROUP] });
    const res = await t.get(callback.replace(/state=[^&]+/, 'state=forged'), { varde_oidc: oidc });
    expect(res.statusCode).toBe(400);
    expect(t.store.sessions.size).toBe(sessions);
  });

  it.each([
    ['a wrong nonce', { nonce: 'other-nonce' }],
    ['a wrong aud', { aud: 'other-client' }],
    ['a wrong iss', { iss: 'https://login.microsoftonline.com/evil/v2.0' }],
    ['an expired ID token', { expired: true }],
    ['a signature by a key outside the JWKS', { foreignKey: true }],
  ])('%s → 401', async (_label, scenario: Scenario) => {
    const res = await login({ groups: [GROUP], ...scenario });
    expect(res.statusCode).toBe(401);
    expect(setCookie(res, '__Host-varde_session')).toBeUndefined();
  });

  it('protected route without cookie → 401', async () => {
    expect((await t.get('/auth/me')).statusCode).toBe(401);
  });

  it('the saved cookie after logout → 401 (same value replayed)', async () => {
    const cookie = await memberSession();
    expect((await t.get('/auth/me', { '__Host-varde_session': cookie })).statusCode).toBe(200);
    const out = await t.post('/auth/logout', { '__Host-varde_session': cookie });
    expect(out.statusCode).toBe(302);
    expect(String(out.headers.location)).toContain('/oauth2/v2.0/logout');
    expect(rawSetCookie(out, '__Host-varde_session')).toMatch(/__Host-varde_session=;/);
    expect((await t.get('/auth/me', { '__Host-varde_session': cookie })).statusCode).toBe(401);
  });

  it('a tampered cookie signature → 401', async () => {
    const cookie = await memberSession();
    const [sid] = cookie.split('.');
    expect((await t.get('/auth/me', { '__Host-varde_session': `${sid}.forged` })).statusCode).toBe(401);
    expect((await t.get('/auth/me', { '__Host-varde_session': sid ?? '' })).statusCode).toBe(401);
  });

  it('session expires after 8 h (fake clock) → 401', async () => {
    const cookie = await memberSession();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 3600 * 1000 + 1000);
    expect((await t.get('/auth/me', { '__Host-varde_session': cookie })).statusCode).toBe(401);
  });

  it('reusing varde_oidc → 400', async () => {
    const { oidc, callback } = await startLogin({ groups: [GROUP] });
    expect((await t.get(callback, { varde_oidc: oidc })).statusCode).toBe(302);
    expect((await t.get(callback, { varde_oidc: oidc })).statusCode).toBe(400);
  });
});

describe('start without Entra', () => {
  it('empty ENTRA_* → the app starts, /auth/login 503, /health answers', async () => {
    const empty = Object.fromEntries(Object.keys(entraEnv()).map((k) => [k, '']));
    const bare = await startApp({ ...empty, DATABASE_URL: undefined });
    try {
      const res = await bare.get('/auth/login');
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ message: 'auth not configured' });
      expect((await bare.get('/auth/callback?code=x&state=y')).statusCode).toBe(503);
      expect([200, 503]).toContain((await bare.get('/health')).statusCode);
    } finally {
      await bare.app.close();
      process.env = { ...saved, ...entraEnv() };
    }
  });
});
