// Cookie names and flags of the admin login (0.7). Both cookies are signed by @fastify/cookie
// with SESSION_SECRET; the session cookie carries only the session id. Its `__Host-` prefix (1.3) makes the
// browser refuse it unless it is Secure, has Path=/ and no Domain: a sibling *.vardahei.tech site can neither
// set nor overwrite it.
import type { CookieSerializeOptions } from '@fastify/cookie';

export const SESSION_COOKIE = '__Host-varde_session';
export const OIDC_COOKIE = 'varde_oidc';
/** Lifetime of the login transaction cookie (state, nonce, PKCE verifier). */
export const OIDC_TTL_SECONDS = 600;

export function sessionCookie(maxAgeSeconds: number): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    signed: true,
    maxAge: maxAgeSeconds,
  };
}

export function oidcCookie(): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/auth',
    signed: true,
    maxAge: OIDC_TTL_SECONDS,
  };
}
