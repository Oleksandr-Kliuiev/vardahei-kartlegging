// Names for who did something (2.16): AuditLog, approvals and publications keep the Entra object id;
// people read the name the person signed in with. Seeds, tests and the CLI read as «Varde».
import type { PrismaService } from '../../prisma/prisma.service.js';

export async function namesOf(
  prisma: PrismaService,
  whos: readonly (string | null | undefined)[],
): Promise<Record<string, string>> {
  const ids = [...new Set(whos.filter((w): w is string => !!w))];
  const oids = ids.map((w) => w.replace(/^entra:/, ''));
  const sessions = oids.length
    ? await prisma.adminSession.findMany({
        where: { oid: { in: oids }, name: { not: null } },
        orderBy: { created_at: 'desc' },
        select: { oid: true, name: true },
      })
    : [];
  const byOid = new Map<string, string>();
  for (const s of sessions) if (s.oid && s.name && !byOid.has(s.oid)) byOid.set(s.oid, s.name);
  return Object.fromEntries(
    ids.map((w) => {
      const oid = w.replace(/^entra:/, '');
      const name = byOid.get(oid);
      if (name) return [w, name];
      // Break-glass already writes the operator's name; machines write a «kind:» prefix.
      if (/^(seed|test|cli|system|import)[:-]/.test(w)) return [w, 'Varde'];
      return [w, /^[0-9a-f-]{20,}$/i.test(oid) ? 'Ein administrator' : w];
    }),
  );
}
