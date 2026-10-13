// Rounds and round clients of an import (1.8): versions of import-map.json, the import round of
// each version and, for the anonymous KI 2026-10-12 version, the round «KI 2026-10-12 (anonym)»
// with its RoundClients created on first use (closed; snapshot and deadline from «KI runde 1»).
import type { Prisma } from '@prisma/client';
import type { RunnerVersion } from '@varde/rules/runner';
import { TemplateContentShape } from '@varde/schema/template/template';

export interface ImportVersion extends RunnerVersion {
  id: string;
  key: string;
  label: string;
  partOf: Map<string, 'common' | 'leader'>;
  roleId: string | undefined;
}

export async function loadVersion(
  tx: Prisma.TransactionClient,
  keyAtLabel: string,
): Promise<ImportVersion> {
  const [key = '', label = ''] = keyAtLabel.split('@');
  const v = await tx.templateVersion.findFirst({
    where: { label, status: 'published', template: { key } },
  });
  if (v === null) throw new Error(`import: template version ${keyAtLabel} is not seeded`);
  const c = TemplateContentShape.parse(v.content);
  return {
    id: v.id,
    key,
    label,
    identification: c.identification,
    leader_roles: c.leader_roles,
    questions: c.questions,
    partOf: new Map(c.questions.map((q) => [q.id, q.part])),
    roleId: c.questions.find((q) => q.role)?.id,
  };
}

export const anonymousRoundName = (v: { key: string; label: string }): string =>
  `${v.key.toUpperCase()} ${v.label} (anonym)`;

export class ImportRounds {
  private readonly rounds = new Map<string, { id: string; name: string }>();
  private readonly roundClients = new Map<string, string>();
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async round(v: ImportVersion): Promise<{ id: string; name: string }> {
    const cached = this.rounds.get(v.id);
    if (cached !== undefined) return cached;
    let r = await this.tx.round.findFirst({
      where: { template_version_id: v.id, type: 'regular' },
      orderBy: { created_at: 'asc' },
    });
    if (r === null) {
      if (v.identification !== 'none')
        throw new Error(`import: no import round for ${v.key}@${v.label} (run seed)`);
      r = await this.tx.round.create({
        data: {
          name: anonymousRoundName(v),
          type: 'regular',
          template_version_id: v.id,
          identification: 'none',
          status: 'closed',
        },
      });
    }
    const out = { id: r.id, name: r.name };
    this.rounds.set(v.id, out);
    return out;
  }

  async roundClient(v: ImportVersion, slug: string): Promise<string> {
    const round = await this.round(v);
    const key = `${round.id}|${slug}`;
    const cached = this.roundClients.get(key);
    if (cached !== undefined) return cached;
    const client = await this.tx.client.findUniqueOrThrow({ where: { slug } });
    let rc = await this.tx.roundClient.findUnique({
      where: { round_id_client_id: { round_id: round.id, client_id: client.id } },
    });
    if (rc === null) {
      if (v.identification !== 'none')
        throw new Error(`import: client ${slug} has no RoundClient in ${round.name} (run seed)`);
      const ki = await this.tx.roundClient.findFirst({
        where: { client_id: client.id, round: { name: 'KI runde 1' } },
      });
      rc = await this.tx.roundClient.create({
        data: {
          round_id: round.id,
          client_id: client.id,
          status: 'closed',
          population_snapshot: ki?.population_snapshot ?? null,
          deadline: ki?.deadline ?? null,
          legacy_code_hash: null,
        },
      });
    }
    this.roundClients.set(key, rc.id);
    return rc.id;
  }

  ids(): string[] {
    return [...new Set([...this.rounds.values()].map((r) => r.id))];
  }
}
