// Data class `samtale` (2.20, ADR-017): a client's conversations live as long as the client's answers and
// go with them on the client's request (`retention.forget`, scope client) or are handed over with them
// (`retention.handover`). A deletion is a DeletionRequest (scope client) whose `scope_ref` lists the
// conversation ids: `deletion_request` is in the ledger export, so a restore deletes them again.
// The actions of the catalogue chosen in a conversation (2.22b, `interview_action`) go with its answers.
import type { Prisma } from '@prisma/client';
import { csv } from '../exports/csv.js';
import { namesOf } from './interview-overview.js';
import { guideQuestions } from './interview-view.js';

type Db = Pick<Prisma.TransactionClient, 'interview' | 'deletionRequest'>;

/** Deletes every conversation of the client (answers go with them), with its own `retention.forget` row
 * in AuditLog (counts only, as for answers); a dry run only counts. */
export async function forgetInterviews(
  tx: Db & Pick<Prisma.TransactionClient, 'auditLog' | '$queryRaw'>,
  client: string,
  who: string,
  reason: string,
  dryRun: boolean,
): Promise<number> {
  // Without a client, Prisma would read `client_id: undefined` as no filter at all.
  if (!client) throw new Error('forgetInterviews needs a client');
  // Locked as they are read: a move to another client either came first (then it is not this client's
  // any more) or waits and finds it gone, so the ledger lists exactly what is deleted.
  const ids = (
    await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM interview WHERE client_id = ${client}::uuid FOR UPDATE`
  ).map((i) => i.id);
  if (dryRun || ids.length === 0) return ids.length;
  const request = await tx.deletionRequest.create({
    data: {
      requested_by: who,
      reason,
      scope: 'client',
      scope_ref: { scope: 'client', client, interviews: ids },
    },
  });
  await tx.interview.deleteMany({ where: { id: { in: ids } } });
  await tx.auditLog.create({
    data: {
      who,
      what: 'retention.forget',
      target: request.id,
      details: { scope: 'client', reason, interviews: ids.length },
    },
  });
  return ids.length;
}

/** After a restore: conversations deleted on request are deleted again. */
export async function applyInterviewLedger(tx: Db): Promise<number> {
  const requests = await tx.deletionRequest.findMany({
    where: { scope: 'client' },
    select: { scope_ref: true },
  });
  const ids = requests.flatMap((r) => {
    const list = (r.scope_ref as { interviews?: unknown } | null)?.interviews;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  });
  if (ids.length === 0) return 0;
  return (await tx.interview.deleteMany({ where: { id: { in: ids } } })).count;
}

const RATING: Record<string, string> = {
  ivaretatt: 'Ivaretatt',
  forbetring: 'Forbetringspotensial',
  manglar: 'Manglar',
  ikkje_aktuelt: 'Ikkje aktuelt',
};

/** «Kari Nordmann, dagleg leiar · eigar» from the stored list of who sat at the table. */
function people(list: Prisma.JsonValue): string {
  if (!Array.isArray(list)) return '';
  return list
    .map((p) => {
      const o = (p ?? {}) as { name?: unknown; role?: unknown };
      return [o.name, o.role].filter((x) => typeof x === 'string' && x).join(', ');
    })
    .filter(Boolean)
    .join(' · ');
}

/** `samtalar.csv` of a handover: who took part, every answer of every conversation, internal notes
 * included, since they are the client's data too; the actions of the catalogue chosen for each answer
 * (2.22b); plus the overall impression, what was agreed and the conversation note. */
export async function interviewsCsv(db: Pick<Db, 'interview'>, client: string): Promise<string> {
  const rows = await db.interview.findMany({
    where: { client_id: client },
    orderBy: { round: { created_at: 'asc' } },
    include: {
      round: { include: { template_version: { select: { content: true } } } },
      answers: { include: { actions: { select: { action: { select: { name: true } } } } } },
    },
  });
  const lines: unknown[][] = [];
  for (const i of rows) {
    const day = i.held_on?.toISOString().slice(0, 10) ?? '';
    for (const [label, text] of [
      ['Kven var med frå kunden', people(i.interviewees)],
      ['Frå Vardahei', i.interviewers.join(', ')],
    ] as const)
      if (text) lines.push([i.round.name, day, '', label, text, '', '', '', '']);
    const byId = new Map(i.answers.map((a) => [a.question_id, a]));
    guideQuestions(i.round.template_version.content).forEach((q, n) => {
      const a = byId.get(q.id);
      if (a)
        lines.push([
          i.round.name,
          day,
          n + 1,
          q.text,
          a.answer,
          RATING[a.rating ?? ''] ?? '',
          a.action,
          namesOf(a.actions.map((x) => x.action)),
          a.note,
        ]);
    });
    for (const [label, text] of [
      ['Samla inntrykk', i.summary],
      ['Avtalt vidare', i.agreed],
      ['Notat om samtalen', i.note],
    ] as const)
      if (text) lines.push([i.round.name, day, '', label, text, '', '', '', '']);
  }
  return csv(
    [
      'Samtalerunde',
      'Dato',
      'Nr',
      'Spørsmål',
      'Kva kunden sa',
      'Vurdering',
      'Konklusjon og tiltak',
      'Tiltak frå katalogen',
      'Eige notat',
    ],
    lines,
  );
}
