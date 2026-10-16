import type { TemplateContent } from '@varde/schema/template/template';
import { auditWho } from '../auth/audit-who.js';
import { PrismaSnapshotStore } from './prisma-snapshot-store.js';
import type { RowsContext } from './rows.js';
import { NotFoundError, UnauthorizedError, type PrivacySession } from './types.js';

/** Full client return is a named admin row channel; every read and its audit share one tx. */
export async function handover(
  clientId: string,
  reason: string,
  recipient: string,
  session: PrivacySession | undefined,
  ctx: RowsContext,
) {
  if (!session) throw new UnauthorizedError();
  return ctx.db.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: clientId } });
    // The technical client of live polls (3.4) is nobody's company: nothing to hand over.
    if (client?.kind !== 'client') throw new NotFoundError();
    const rounds = await tx.round.findMany({
      where: { round_clients: { some: { client_id: clientId } } },
      include: { template_version: true },
      orderBy: { created_at: 'asc' },
    });
    const bundles = [];
    for (const round of rounds) {
      if (!round.template_version) continue;
      const rows = await ctx.source.read({ round: round.id, client: client.slug }, tx);
      bundles.push({ content: round.template_version.content as unknown as TemplateContent, rows });
    }
    const snapshots = await new PrismaSnapshotStore(tx).handoverSnapshots(clientId);
    const all = bundles.flatMap((b) => b.rows);
    const counts = {
      common: all.filter((r) => r.part === 'common').length,
      leader: all.filter((r) => r.part === 'leader').length,
      snapshots: snapshots.length,
    };
    await tx.auditLog.create({
      data: {
        who: auditWho(session, true),
        what: 'retention.handover',
        target: 'client:' + clientId,
        details: { client: clientId, recipient, reason, counts },
      },
    });
    return { client, bundles, snapshots, counts };
  });
}
