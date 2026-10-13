// Login transaction of the Authorization Code + PKCE flow (0.7): state, nonce and verifier live
// in the signed, HttpOnly cookie varde_oidc (≤ 10 min) and are accepted once per process.
import { randomUUID } from 'node:crypto';
import * as client from 'openid-client';
import { OIDC_TTL_SECONDS } from './cookies.js';

export interface OidcTransaction {
  tid: string;
  state: string;
  nonce: string;
  verifier: string;
  /** Epoch ms. */
  exp: number;
}

export function newTransaction(now = Date.now()): OidcTransaction {
  return {
    tid: randomUUID(),
    state: client.randomState(),
    nonce: client.randomNonce(),
    verifier: client.randomPKCECodeVerifier(),
    exp: now + OIDC_TTL_SECONDS * 1000,
  };
}

export function parseTransaction(raw: string): OidcTransaction | null {
  try {
    const t = JSON.parse(raw) as Partial<OidcTransaction>;
    const ok =
      typeof t.tid === 'string' &&
      typeof t.state === 'string' &&
      typeof t.nonce === 'string' &&
      typeof t.verifier === 'string' &&
      typeof t.exp === 'number';
    return ok ? (t as OidcTransaction) : null;
  } catch {
    return null;
  }
}

/** One use per transaction id (a replayed varde_oidc cookie → 400). */
export class ConsumedTransactions {
  private readonly used = new Map<string, number>();

  consume(t: OidcTransaction, now = Date.now()): boolean {
    for (const [tid, exp] of this.used) if (exp < now) this.used.delete(tid);
    if (t.exp < now || this.used.has(t.tid)) return false;
    this.used.set(t.tid, t.exp);
    return true;
  }
}
