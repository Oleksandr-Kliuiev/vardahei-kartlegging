// In-memory SessionStore for unit tests (no Postgres): same contract as PrismaSessionStore,
// including "session + audit in one transaction" with an injectable audit failure.
import { randomUUID } from 'node:crypto';
import {
  type AuditEntry,
  type NewSession,
  SessionStore,
  type SessionVia,
  type StoredSession,
} from '../../src/modules/auth/session.store.js';

export class MemorySessionStore extends SessionStore {
  readonly sessions = new Map<string, StoredSession>();
  readonly audits: (AuditEntry & { at: Date })[] = [];
  failAudit = false;

  create(session: NewSession, audit?: AuditEntry): Promise<StoredSession> {
    if (audit !== undefined && this.failAudit)
      return Promise.reject(new Error('audit write failed'));
    const stored: StoredSession = {
      ...session,
      sid: randomUUID(),
      createdAt: new Date(),
      revokedAt: null,
    };
    if (audit !== undefined) this.audits.push({ ...audit, at: new Date() });
    this.sessions.set(stored.sid, stored);
    return Promise.resolve(stored);
  }

  find(sid: string): Promise<StoredSession | null> {
    return Promise.resolve(this.sessions.get(sid) ?? null);
  }

  extend(sid: string, expiresAt: Date): Promise<void> {
    const s = this.sessions.get(sid);
    if (s !== undefined && s.revokedAt === null && s.expiresAt < expiresAt) s.expiresAt = expiresAt;
    return Promise.resolve();
  }

  revoke(sid: string, at: Date): Promise<void> {
    const s = this.sessions.get(sid);
    if (s !== undefined && s.revokedAt === null) s.revokedAt = at;
    return Promise.resolve();
  }

  revokeVia(via: SessionVia, at: Date): Promise<number> {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.via === via && s.revokedAt === null) {
        s.revokedAt = at;
        n += 1;
      }
    }
    return Promise.resolve(n);
  }

  audit(entry: AuditEntry): Promise<void> {
    if (this.failAudit) return Promise.reject(new Error('audit write failed'));
    this.audits.push({ ...entry, at: new Date() });
    return Promise.resolve();
  }
}
