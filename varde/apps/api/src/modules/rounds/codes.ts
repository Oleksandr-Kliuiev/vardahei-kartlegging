import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../../prisma/prisma.service.js';

export function issueCode(): string {
  return randomBytes(16).toString('base64url');
}

export function codeHash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Codes in query strings and cookies are never accepted by the API. */
export function bearer(request: Pick<FastifyRequest, 'headers'>): string {
  const value = request.headers.authorization;
  const match = typeof value === 'string' ? /^Bearer ([A-Za-z0-9_-]{22})$/i.exec(value) : null;
  return match?.[1] ?? '';
}

/** Deadline is a calendar day in Norway (including daylight saving time). */
export function deadlineExpiry(deadline: Date): Date {
  const next = new Date(deadline);
  next.setUTCDate(next.getUTCDate() + 1);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo', hour: '2-digit', timeZoneName: 'shortOffset',
  });
  const zone = fmt.formatToParts(next).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const offset = Number(/GMT\+(\d+)/.exec(zone)?.[1] ?? 1);
  return new Date(next.getTime() - offset * 3600_000);
}

const include = { round: { include: { template_version: true } }, client: true } as const;
export type ResolvedRoundClient = Prisma.RoundClientGetPayload<{ include: typeof include }>;
export type CodeResolution = ResolvedRoundClient | 'unknown' | 'revoked' | 'expired';

export function requireCode(result: CodeResolution): ResolvedRoundClient {
  if (result === 'unknown') throw new ForbiddenException('Lenkja er ikkje gyldig.');
  if (result === 'revoked')
    throw new ForbiddenException('Lenkja er bytt ut. Spør den som sende deg ho om den nye.');
  if (result === 'expired') throw new HttpException('Kartlegginga er avslutta.', 410);
  return result;
}

@Injectable()
export class CodesService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCode(code: string, now = new Date(), db: Prisma.TransactionClient = this.prisma): Promise<CodeResolution> {
    if (!/^[A-Za-z0-9_-]{22}$/.test(code)) return 'unknown';
    const hash = codeHash(code);
    const rc = await db.roundClient.findUnique({ where: { code_hash: hash }, include });
    if (rc === null) {
      return (await db.revokedRoundCode.findUnique({ where: { code_hash: hash } }))
        ? 'revoked' : 'unknown';
    }
    if (rc.code_revoked_at !== null) return 'revoked';
    if (rc.status !== 'open' || rc.round.status !== 'open' ||
      (rc.code_expires_at !== null && rc.code_expires_at <= now) ||
      (rc.deadline !== null && deadlineExpiry(rc.deadline) <= now)) return 'expired';
    return rc;
  }

  /** Caller holds the RoundClient lock; code + history + audit commit together. */
  async issue(tx: Prisma.TransactionClient, id: string, who: string, expiresAt?: Date) {
    const rc = await tx.roundClient.findUnique({ where: { id } });
    if (rc === null) throw new NotFoundException('Kartlegginga finst ikkje.');
    const reissue = rc.code_hash !== null;
    if (rc.code_hash !== null) {
      await tx.revokedRoundCode.upsert({
        where: { code_hash: rc.code_hash },
        create: { code_hash: rc.code_hash, round_client_id: id }, update: {},
      });
    }
    const code = issueCode();
    const hash = codeHash(code);
    // Prisma errors may include the mutation arguments. A failed code write must not expose
    // the freshly generated bearer to the global exception logger (even on a database error).
    const updated = await tx.roundClient.update({ where: { id }, data: {
      code, code_hash: hash, code_revoked_at: null,
      code_expires_at: expiresAt ?? (rc.deadline === null ? null : deadlineExpiry(rc.deadline)),
    } }).catch(() => { throw new ServiceUnavailableException('Lenkja kunne ikkje lagast. Prøv igjen.'); });
    await tx.auditLog.create({ data: {
      who, what: `rounds.code.${reissue ? 'reissue' : 'issue'}`,
      target: `round_client:${id}`, details: { hash: hash.slice(0, 12) },
    } });
    return updated;
  }

  reissue(id: string, who: string, expiresAt?: Date) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM round_client WHERE id = ${id}::uuid FOR UPDATE`;
      return this.issue(tx, id, who, expiresAt);
    });
  }

  revoke(id: string, who: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM round_client WHERE id = ${id}::uuid FOR UPDATE`;
      const rc = await tx.roundClient.findUnique({ where: { id } });
      if (rc === null || rc.code_hash === null) throw new NotFoundException();
      const updated = await tx.roundClient.update({ where: { id }, data: { code_revoked_at: new Date() } });
      await tx.auditLog.create({ data: {
        who, what: 'rounds.code.revoke', target: `round_client:${id}`,
        details: { hash: rc.code_hash.slice(0, 12) },
      } });
      return updated;
    });
  }
}
