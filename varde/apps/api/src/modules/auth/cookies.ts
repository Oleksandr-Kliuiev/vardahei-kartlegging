// Cookie names and flags of the admin login (0.7). Both cookies are signed by @fastify/cookie
// with SESSION_SECRET; varde_session carries only the session id.
import type { CookieSerializeOptions } from '@fastify/cookie';

export const SESSION_COOKIE = 'varde_session';
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
