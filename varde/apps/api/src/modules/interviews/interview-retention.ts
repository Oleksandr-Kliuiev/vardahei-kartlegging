// Data class `samtale` (2.20, ADR-017): a client's conversations live as long as the client's answers and
// go with them on the client's request (`retention.forget`, scope client) or are handed over with them
// (`retention.handover`). A deletion is a DeletionRequest (scope client) whose `scope_ref` lists the
// conversation ids: `deletion_request` is in the ledger export, so a restore deletes them again.
import type { Prisma } from '@prisma/client';
import { csv } from '../exports/csv.js';
import { guideQuestions } from './interview-view.js';

type Db = Pick<Prisma.TransactionClient, 'interview' | 'deletionRequest'>;

/** Deletes every conversation of the client (answers go with them); a dry run only counts. */
export async function forgetInterviews(
  tx: Db,
  client: string,
  who: string,
  reason: string,
  dryRun: boolean,
): Promise<number> {
  const ids = (
    await tx.interview.findMany({ where: { client_id: client }, select: { id: true } })
  ).map((i) => i.id);
  if (dryRun || ids.length === 0) return ids.length;
  await tx.deletionRequest.create({
    data: {
      requested_by: who,
      reason,
      scope: 'client',
      scope_ref: { scope: 'client', client, interviews: ids },
    },
  });
  await tx.interview.deleteMany({ where: { id: { in: ids } } });
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

/** `samtalar.csv` of a handover: every answer of every conversation, internal notes included, since
 * they are the client's data too; plus the overall impression, what was agreed and the conversation note. */
export async function interviewsCsv(db: Pick<Db, 'interview'>, client: string): Promise<string> {
  const rows = await db.interview.findMany({
    where: { client_id: client },
    orderBy: { round: { created_at: 'asc' } },
    include: {
      round: { include: { template_version: { select: { content: true } } } },
      answers: true,
    },
  });
  const lines: unknown[][] = [];
  for (const i of rows) {
    const day = i.held_on?.toISOString().slice(0, 10) ?? '';
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
          a.note,
        ]);
    });
    for (const [label, text] of [
      ['Samla inntrykk', i.summary],
      ['Avtalt vidare', i.agreed],
      ['Notat om samtalen', i.note],
    ] as const)
      if (text) lines.push([i.round.name, day, '', label, text, '', '', '']);
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
      'Eige notat',
    ],
    lines,
  );
}
