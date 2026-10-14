// Class `rows` (0.15, ADR-025): rows of the common part for the three admins. Admin session
// only; AuditLog is written first and the read happens in the same transaction — a failed
// AuditLog means no rows, a failed read leaves no AuditLog (rollback). `respondent_key` only in
// mode initials. Views on rows (per employee, Master_Analyse export) are 404 in anonymous
// rounds; their real implementation is 1.27b / 1.30b.
import type { Prisma } from '@prisma/client';
import type { ResponseSource } from './source.js';
import {
  NotFoundError,
  type PrivacyRow,
  type PrivacySession,
  type ResponseRow,
  type RoundMode,
  type RowsQuery,
  type RowsResult,
  UnauthorizedError,
} from './types.js';

export type RowsView = 'rows' | 'per_employee' | 'master_analyse_export';

/** The part of PrismaService that `rows` needs (tests wrap it to inject failures). */
export interface RowsDb {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

export interface RowsContext {
  db: RowsDb;
  source: ResponseSource;
}

export const ROWS_AUDIT = 'privacy.rows';

/** Who reads: entra:<oid>; for break-glass the operator of the window (session name), 1.10b. */
export function auditWho(session: PrivacySession): string {
  if (session.via === 'break_glass' && session.name !== null && session.name !== '')
    return session.name;
  return `${session.via}:${session.oid ?? session.sid}`;
}

function toRow(row: ResponseRow, mode: RoundMode): PrivacyRow {
  return {
    round_client: row.round_client,
    client: row.client,
    part: 'common',
    role: row.role,
    ...(mode === 'initials' && row.respondent_key !== undefined
      ? { respondent_key: row.respondent_key }
      : {}),
    answers: row.answers,
    submitted_day: row.submitted_day,
  };
}

function requireSession(session: PrivacySession | null | undefined): PrivacySession {
  if (session === null || session === undefined) throw new UnauthorizedError();
  return session;
}

export async function rows(
  query: RowsQuery,
  session: PrivacySession | null | undefined,
  ctx: RowsContext,
  view: RowsView = 'rows',
): Promise<RowsResult> {
  const who = auditWho(requireSession(session));
  const scope = {
    round: query.round,
    ...(query.client === undefined ? {} : { client: query.client }),
  };
  return ctx.db.$transaction(async (tx) => {
    const entry = await tx.auditLog.create({
      data: { who, what: ROWS_AUDIT, target: `round:${query.round}`, details: { ...scope, view } },
    });
    const mode = await ctx.source.roundMode(query.round, tx);
    const read = await ctx.source.read({ ...scope, part: 'common' }, tx);
    const out = read.filter((r) => r.part === 'common').map((r) => toRow(r, mode));
    await tx.auditLog.update({
      where: { id: entry.id },
      data: { details: { ...scope, view, count: out.length } },
    });
    return { ...scope, mode, rows: out };
  });
}

/** A view that exists only in identified rounds; 404 in anonymous ones (before any read). */
async function identifiedView(
  view: RowsView,
  query: RowsQuery,
  session: PrivacySession | null | undefined,
  ctx: RowsContext,
): Promise<RowsResult> {
  requireSession(session);
  if ((await ctx.source.roundMode(query.round)) === 'none') throw new NotFoundError();
  return rows(query, session, ctx, view);
}

/** "Svar per tilsett" (1.27b): stub over `rows` with the mode check. */
export function perEmployee(
  query: RowsQuery,
  session: PrivacySession | null | undefined,
  ctx: RowsContext,
): Promise<RowsResult> {
  return identifiedView('per_employee', query, session, ctx);
}

/** Master_Analyse export (1.30b): stub over `rows` with the mode check. */
export function masterAnalyseExport(
  query: RowsQuery,
  session: PrivacySession | null | undefined,
  ctx: RowsContext,
): Promise<RowsResult> {
  return identifiedView('master_analyse_export', query, session, ctx);
}
