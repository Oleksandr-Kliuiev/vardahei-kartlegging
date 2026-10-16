// Presenter key of a seminar (3.4, ADR-008): the big screen works on the seminar day without Entra.
// A 256-bit random key, shown once to the admin as the link `/p#t=<key>` (the fragment never reaches
// a server, a log or a Referer); the database keeps only its sha256. The API takes it only as
// `Authorization: Bearer`. Scope: open, close and show the questions of this seminar's live poll and
// read its state and shown results — nothing else (presenter.guard.ts). Valid the day before, on and
// the day after the seminar (window.ts); one active key per seminar, a new key revokes the old;
// issue and revoke are in AuditLog with the key's row id and a hash prefix, never the key.
import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import { publicOrigin } from '../seminars/seminars.service.js';
import { inWindow, presenterWindow, windowText } from './window.js';

const KEY = /^[A-Za-z0-9_-]{43}$/;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** The key only from `Authorization: Bearer` (never a query string or a cookie). */
export function presenterBearer(request: Pick<FastifyRequest, 'headers'>): string {
  const value = request.headers.authorization;
  const match = typeof value === 'string' ? /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(value) : null;
  return match?.[1] ?? '';
}

export interface PresenterAccess {
  /** Row id of the key (AuditLog `presenter:<id>`), never the key. */
  token: string;
  seminar: string;
  round: string;
  /** End of the window: the stream closes then. */
  until: Date;
}
export type PresenterResolution =
  PresenterAccess | 'missing' | 'unknown' | 'revoked' | 'outside' | 'no-poll';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PresenterTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async resolve(
    token: string,
    now = new Date(),
    db: Db = this.prisma,
  ): Promise<PresenterResolution> {
    if (token === '') return 'missing';
    if (!KEY.test(token)) return 'unknown';
    const row = await db.presenterToken.findUnique({
      where: { token_hash: tokenHash(token) },
      include: { seminar: true },
    });
    if (row === null) return 'unknown';
    if (row.revoked_at !== null) return 'revoked';
    if (!inWindow(row.seminar, now)) return 'outside';
    if (row.seminar.round_live_id === null) return 'no-poll';
    return {
      token: row.id,
      seminar: row.seminar_id,
      round: row.seminar.round_live_id,
      until: presenterWindow(row.seminar).to,
    };
  }

  /** The stream asks again on every push and ping: revoked or outside the window ends it. */
  async stillValid(id: string, now = new Date()): Promise<boolean> {
    const row = await this.prisma.presenterToken.findUnique({
      where: { id },
      include: { seminar: true },
    });
    return (
      row !== null &&
      row.revoked_at === null &&
      row.seminar.round_live_id !== null &&
      inWindow(row.seminar, now)
    );
  }

  /** The active key of a seminar for the admin (never the key itself). */
  async status(seminar: string, now = new Date()) {
    const s = await this.prisma.seminar.findUnique({ where: { id: seminar } });
    if (!s) throw new NotFoundException('Seminaret finst ikkje.');
    const w = presenterWindow(s);
    const active = await this.prisma.presenterToken.findFirst({
      where: { seminar_id: seminar, revoked_at: null },
    });
    return {
      valid_from: w.from.toISOString(),
      valid_to: w.to.toISOString(),
      valid_text: windowText(w),
      valid_now: inWindow(s, now),
      active: active && {
        issued_at: active.created_at.toISOString(),
        issued_by: active.created_by,
      },
    };
  }

  /** Prisma errors can carry the arguments: none of them reaches the logger. */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Nøkkelen kunne ikkje lagast. Prøv igjen.');
    }
  }

  private async revokeIn(tx: Prisma.TransactionClient, seminar: string, who: string, why: string) {
    const active = await tx.presenterToken.findMany({
      where: { seminar_id: seminar, revoked_at: null },
    });
    for (const key of active) {
      await tx.presenterToken.update({
        where: { id: key.id },
        data: { revoked_at: new Date(), revoked_by: who },
      });
      await tx.auditLog.create({
        data: {
          who,
          what: 'seminars.presenter.revoke',
          target: `seminar:${seminar}`,
          details: { key: key.id, hash: key.token_hash.slice(0, 12), why },
        },
      });
    }
    return active.length;
  }

  /** A new key for the seminar (the old one stops at once). The link is shown once. */
  async issue(seminar: string, who: string, now = new Date()) {
    const origin = publicOrigin();
    if (!origin)
      throw new ServiceUnavailableException('Adressa til Varde (PUBLIC_URL) er ikkje sett opp.');
    const token = randomBytes(32).toString('base64url');
    const hash = tokenHash(token);
    const result = await this.guarded(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM seminar WHERE id = ${seminar}::uuid FOR UPDATE`;
        const s = await tx.seminar.findUnique({ where: { id: seminar } });
        if (!s) throw new NotFoundException('Seminaret finst ikkje.');
        if (s.round_live_id === null) throw new BadRequestException('Lag live-spørsmåla først.');
        const w = presenterWindow(s);
        if (now >= w.to)
          throw new BadRequestException('Seminaret er over. Ein ny nøkkel ville ikkje verke.');
        await this.revokeIn(tx, seminar, who, 'replaced');
        const key = await tx.presenterToken.create({
          data: { seminar_id: seminar, token_hash: hash, created_by: who },
        });
        await tx.auditLog.create({
          data: {
            who,
            what: 'seminars.presenter.issue',
            target: `seminar:${seminar}`,
            details: { key: key.id, hash: hash.slice(0, 12) },
          },
        });
        return { round: s.round_live_id, w };
      }),
    );
    this.events.liveChanged(result.round);
    return {
      link: `${origin.origin}/p#t=${token}`,
      valid_from: result.w.from.toISOString(),
      valid_to: result.w.to.toISOString(),
      valid_text: windowText(result.w),
    };
  }

  /** «Trekk tilbake»: the key stops at once; open screens lose their stream. */
  async revoke(seminar: string, who: string) {
    const round = await this.guarded(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM seminar WHERE id = ${seminar}::uuid FOR UPDATE`;
        const s = await tx.seminar.findUnique({ where: { id: seminar } });
        if (!s) throw new NotFoundException('Seminaret finst ikkje.');
        if ((await this.revokeIn(tx, seminar, who, 'revoked')) === 0)
          throw new NotFoundException('Det finst ingen aktiv nøkkel til storskjermen.');
        return s.round_live_id;
      }),
    );
    if (round !== null) this.events.liveChanged(round);
    return { ok: true };
  }

  /** Inside the caller's transaction, when the live poll goes away (no key without a poll). */
  revokeAll(tx: Prisma.TransactionClient, seminar: string, who: string) {
    return this.revokeIn(tx, seminar, who, 'poll removed');
  }
}
