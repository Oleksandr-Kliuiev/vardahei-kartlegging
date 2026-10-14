// Class `rows` (0.15, ADR-025): rows of the common part for the three admins. Admin session
// only; AuditLog is written first and the read happens in the same transaction — a failed
// AuditLog means no rows, a failed read leaves no AuditLog (rollback). `respondent_key` only in
// mode initials. Views on rows (per employee, Master_Analyse export) are 404 in anonymous
// rounds; their real implementation is 1.27b / 1.30b.
import type { Prisma } from '@prisma/client';
import { auditWho } from '../auth/audit-who.js';
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

function toRow(row: ResponseRow, mode: RoundMode): PrivacyRow {
  return {
    ...(row.submission_id === undefined ? {} : { submission_id: row.submission_id }),
    ...(row.free === undefined ? {} : { free: row.free }),
    source_id: row.source_id ?? null,
    lang: row.lang ?? 'nn',
    duration_s: row.duration_s ?? null,
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
  const who = auditWho(requireSession(session), true);
  const scope = {
    round: query.round,
    ...(query.client === undefined ? {} : { client: query.client }),
  };
  return ctx.db.$transaction(async (tx) => {
    const entry = await tx.auditLog.create({
      data: {
        who,
        what: view === 'master_analyse_export' ? 'exports.master_analyse' : ROWS_AUDIT,
        target: `round:${query.round}`,
        details: { ...scope, view },
      },
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

/** Leader channel: one client, no common responses, no identifier. Read + audit commit together. */
export async function leaderAnswers(
  query: RowsQuery & { client: string },
  session: PrivacySession | null | undefined,
  ctx: RowsContext,
) {
  const who = auditWho(requireSession(session), true);
  if (!query.client || query.client === 'alle') throw new NotFoundError('Vel éin kunde.');
  return ctx.db.$transaction(async (tx) => {
    const read = await ctx.source.read({ ...query, part: 'leader' }, tx);
    const out = read
      .filter((r) => r.part === 'leader')
      .map((r) => ({
        submission_id: r.submission_id,
        role: r.role,
        answers: r.answers,
        free: r.free ?? {},
      }));
    await tx.auditLog.create({
      data: {
        who,
        what: 'leader.read',
        target: `client:${query.client}`,
        details: { round: query.round, client: query.client, count: out.length },
      },
    });
    return out;
  });
}

/** Current and matched previous common responses with one audit in one transaction. */
export async function employeeHistory(
  query: RowsQuery,
  previous: string | undefined,
  session: PrivacySession | null | undefined,
  ctx: RowsContext,
  audit: 'privacy.rows' | 'exports.master_analyse' = 'privacy.rows',
) {
  const who = auditWho(requireSession(session), true);
  return ctx.db.$transaction(async (tx) => {
    const mode = await ctx.source.roundMode(query.round, tx);
    if (mode === 'none') throw new NotFoundError(); // before either response read
    if (previous && (await ctx.source.roundMode(previous, tx)) !== 'initials')
      throw new NotFoundError();
    const current = (await ctx.source.read({ ...query, part: 'common' }, tx))
      .filter((r) => r.part === 'common')
      .map((r) => toRow(r, mode));
    const prior =
      previous === undefined
        ? []
        : (
            await ctx.source.read(
              {
                round: previous,
                ...(query.client ? { client: query.client } : {}),
                part: 'common',
              },
              tx,
            )
          )
            .filter((r) => r.part === 'common')
            .map((r) => toRow(r, 'initials'));
    await tx.auditLog.create({
      data: {
        who,
        what: audit,
        target: `round:${query.round}`,
        details: {
          round: query.round,
          client: query.client ?? 'alle',
          view: 'per_employee',
          count: current.length,
          previous: previous ?? null,
          previous_count: prior.length,
        },
      },
    });
    return { current, prior };
  });
}
