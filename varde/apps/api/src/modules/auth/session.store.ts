// Server-side admin sessions (table admin_session, 0.7) and the AuditLog entries written with
// them (break-glass, 0.8). The abstract class is the Nest token; tests use an in-memory store.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export type SessionVia = 'entra' | 'break_glass';

export interface StoredSession {
  sid: string;
  oid: string | null;
  name: string | null;
  via: SessionVia;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewSession {
  oid: string | null;
  name: string | null;
  via: SessionVia;
  expiresAt: Date;
}

export interface AuditEntry {
  who: string;
  what: string;
  target?: string;
  details?: Record<string, string | number | boolean>;
}

export abstract class SessionStore {
  /** Creates the session; with `audit`, both rows are written in one transaction or neither. */
  abstract create(session: NewSession, audit?: AuditEntry): Promise<StoredSession>;
  abstract find(sid: string): Promise<StoredSession | null>;
  abstract revoke(sid: string, at: Date): Promise<void>;
  /** Revokes every open session of one kind (break-glass window closed). */
  abstract revokeVia(via: SessionVia, at: Date): Promise<number>;
  abstract audit(entry: AuditEntry): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Row {
  sid: string;
  oid: string | null;
  name: string | null;
  via: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

function toSession(row: Row): StoredSession {
  return {
    sid: row.sid,
    oid: row.oid,
    name: row.name,
    via: row.via as SessionVia,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

@Injectable()
export class PrismaSessionStore extends SessionStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(session: NewSession, audit?: AuditEntry): Promise<StoredSession> {
    const data = {
      oid: session.oid,
      name: session.name,
      via: session.via,
      expires_at: session.expiresAt,
    };
    if (audit === undefined) return toSession(await this.prisma.adminSession.create({ data }));
    const [, row] = await this.prisma.$transaction([
      this.prisma.auditLog.create({ data: audit }),
      this.prisma.adminSession.create({ data }),
    ]);
    return toSession(row);
  }

  async find(sid: string): Promise<StoredSession | null> {
    if (!UUID.test(sid)) return null;
    const row = await this.prisma.adminSession.findUnique({ where: { sid } });
    return row === null ? null : toSession(row);
  }

  async revoke(sid: string, at: Date): Promise<void> {
    if (!UUID.test(sid)) return;
    await this.prisma.adminSession.updateMany({
      where: { sid, revoked_at: null },
      data: { revoked_at: at },
    });
  }

  async revokeVia(via: SessionVia, at: Date): Promise<number> {
    const result = await this.prisma.adminSession.updateMany({
      where: { via, revoked_at: null },
      data: { revoked_at: at },
    });
    return result.count;
  }

  async audit(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: entry });
  }
}
