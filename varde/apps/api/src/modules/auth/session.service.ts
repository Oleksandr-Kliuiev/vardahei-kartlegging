// Issues, resolves and revokes admin sessions (0.7). The cookie holds only the signed sid.
import { Inject, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sessionIdleSeconds, sessionTtlSeconds } from '../../config/auth-config.js';
import { SESSION_COOKIE, sessionCookie } from './cookies.js';
import { LISTENER, type Listener, VIA_FOR_LISTENER } from './listener.js';
import {
  type AuditEntry,
  type NewSession,
  SessionStore,
  type StoredSession,
} from './session.store.js';

/** A sliding window is moved at most this often: one write per five minutes of use. */
const SLIDE_STEP_MS = 5 * 60_000;

@Injectable()
export class SessionService {
  constructor(
    private readonly store: SessionStore,
    @Inject(LISTENER) private readonly listener: Listener,
  ) {}

  async issue(
    reply: FastifyReply,
    session: NewSession,
    audit?: AuditEntry,
  ): Promise<StoredSession> {
    // The cookie lives as long as the absolute lifetime; the stored end of an Entra session is its idle window
    // (1.3), moved later while the session is used (see slide).
    const idleEnd = Date.now() + sessionIdleSeconds() * 1000;
    const stored = await this.store.create(
      session.via === 'entra'
        ? { ...session, expiresAt: new Date(Math.min(session.expiresAt.getTime(), idleEnd)) }
        : session,
      audit,
    );
    const maxAge = Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
    void reply.setCookie(SESSION_COOKIE, stored.sid, sessionCookie(maxAge));
    return stored;
  }

  /**
   * Valid session of this listener, or null: bad signature, unknown, revoked, expired, other via. A request
   * is use and slides the idle window; a check that is not (`touch` false: the ping of an open event stream)
   * must not, or a tab left open would keep the session alive for the whole absolute lifetime.
   */
  async resolve(request: FastifyRequest, touch = true): Promise<StoredSession | null> {
    const raw = request.cookies[SESSION_COOKIE];
    if (raw === undefined) return null;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || unsigned.value === null) return null;
    const session = await this.store.find(unsigned.value);
    if (session === null || session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (session.via !== VIA_FOR_LISTENER[this.listener]) return null;
    return touch ? this.slide(session) : session;
  }

  /** An Entra session ends after SESSION_IDLE_SECONDS without a request, and in any case at its absolute lifetime. */
  private async slide(session: StoredSession): Promise<StoredSession> {
    if (session.via !== 'entra') return session;
    const absolute = session.createdAt.getTime() + sessionTtlSeconds() * 1000;
    const next = Math.min(absolute, Date.now() + sessionIdleSeconds() * 1000);
    if (next - session.expiresAt.getTime() < SLIDE_STEP_MS) return session;
    const expiresAt = new Date(next);
    await this.store.extend(session.sid, expiresAt);
    return { ...session, expiresAt };
  }

  async revoke(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = await this.resolve(request);
    if (session !== null) await this.store.revoke(session.sid, new Date());
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
