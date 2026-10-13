// Issues, resolves and revokes admin sessions (0.7). The cookie holds only the signed sid.
import { Inject, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, sessionCookie } from './cookies.js';
import { LISTENER, type Listener, VIA_FOR_LISTENER } from './listener.js';
import {
  type AuditEntry,
  type NewSession,
  SessionStore,
  type StoredSession,
} from './session.store.js';

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
    const stored = await this.store.create(session, audit);
    const maxAge = Math.max(1, Math.floor((stored.expiresAt.getTime() - Date.now()) / 1000));
    void reply.setCookie(SESSION_COOKIE, stored.sid, sessionCookie(maxAge));
    return stored;
  }

  /** Valid session of this listener, or null: bad signature, unknown, revoked, expired, other via. */
  async resolve(request: FastifyRequest): Promise<StoredSession | null> {
    const raw = request.cookies[SESSION_COOKIE];
    if (raw === undefined) return null;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || unsigned.value === null) return null;
    const session = await this.store.find(unsigned.value);
    if (session === null || session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (session.via !== VIA_FOR_LISTENER[this.listener]) return null;
    return session;
  }

  async revoke(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = await this.resolve(request);
    if (session !== null) await this.store.revoke(session.sid, new Date());
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
