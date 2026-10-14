// Seed of clients, templates and the import rounds of kartlegging (1.7, ADR-009, ADR-022).
// kartlegging codes are never stored: RoundClient.legacy_code_hash = sha256(code), so an old link
// or poster gets «Kartlegginga er avslutta». Every step is idempotent (second run → unchanged).
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { FindingsService } from '../findings/findings.service.js';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { readSeedTemplates, SeedTemplatesService } from '../surveys/seed-templates.js';

export interface SeedClient {
  slug: string;
  name: string;
}
export type Kundar = Record<
  string,
  { tilsette: number | null; open?: boolean; frist: string | null }
>;
export type Tilgang = Record<string, string>;
type Outcome = 'created' | 'updated' | 'unchanged';
export type Counts = Record<Outcome, number>;

export const RUNDE1_LABEL = 'runde1-forms-2026-01';
/** Import rounds of kartlegging: name, template key, version label, type. */
export const IMPORT_ROUNDS = [
  {
    name: 'Runde 1 (Forms, januar 2026)',
    key: 'tryggleik',
    label: RUNDE1_LABEL,
    type: 'external_import',
    legacy: false,
  },
  {
    name: 'Runde 2 IT-tryggleik',
    key: 'tryggleik',
    label: '2026-10-13',
    type: 'regular',
    legacy: true,
  },
  { name: 'KI runde 1', key: 'ki', label: '2026-10-13', type: 'regular', legacy: true },
] as const;

export const legacyHash = (code: string): string => createHash('sha256').update(code).digest('hex');
const empty = (): Counts => ({ created: 0, updated: 0, unchanged: 0 });
const day = (d: string | null): Date | null => (d === null ? null : new Date(`${d}T00:00:00Z`));
const sameDay = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

@Injectable()
export class SeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: SeedTemplatesService,
    private readonly findings: FindingsService,
  ) {}

  async seedClients(clients: readonly SeedClient[], kundar: Kundar): Promise<Counts> {
    const counts = empty();
    for (const c of clients) {
      const employees = kundar[c.slug]?.tilsette ?? null;
      const found = await this.prisma.client.findUnique({ where: { slug: c.slug } });
      if (found === null) {
        await this.prisma.client.create({
          data: { slug: c.slug, name: c.name, employee_count: employees },
        });
        counts.created += 1;
      } else if (found.name !== c.name || found.employee_count !== employees) {
        await this.prisma.client.update({
          where: { id: found.id },
          data: { name: c.name, employee_count: employees },
        });
        counts.updated += 1;
      } else counts.unchanged += 1;
    }
    return counts;
  }

  /** Templates of config/seed plus tryggleik@runde1-forms-2026-01 (origin external_import). */
  async seedAllTemplates(seedDir: string, who: string): Promise<Counts> {
    const counts = empty();
    const files = readSeedTemplates(seedDir);
    const tryggleik = files.find((f) => f.content.key === 'tryggleik');
    if (tryggleik === undefined) throw new Error('seed: no tryggleik template');
    for (const file of [
      ...files,
      { ...tryggleik, label: RUNDE1_LABEL, origin: 'external_import' as const },
    ]) {
      counts[await this.templates.seedOne(file, who)] += 1;
    }
    return counts;
  }

  async seedImportRounds(
    kundar: Kundar,
    tilgang: Tilgang,
  ): Promise<{ rounds: Counts; roundClients: Counts; legacyHashes: number }> {
    const rounds = empty();
    const roundClients = empty();
    let legacyHashes = 0;
    const clients = await this.prisma.client.findMany({
      where: { slug: { in: Object.keys(kundar) } },
    });
    for (const spec of IMPORT_ROUNDS) {
      const version = await this.prisma.templateVersion.findFirstOrThrow({
        where: { label: spec.label, template: { key: spec.key }, status: 'published' },
      });
      let round = await this.prisma.round.findFirst({
        where: { name: spec.name, template_version_id: version.id },
      });
      if (round === null) {
        round = await this.prisma.round.create({
          data: {
            name: spec.name,
            type: spec.type,
            template_version_id: version.id,
            identification: version.identification,
            status: 'closed',
          },
        });
        rounds.created += 1;
      } else rounds.unchanged += 1;
      for (const client of clients) {
        const k = kundar[client.slug];
        const code = spec.legacy ? tilgang[client.slug] : undefined;
        const want = {
          population_snapshot: k?.tilsette ?? null,
          deadline: day(k?.frist ?? null),
          legacy_code_hash: code === undefined ? null : legacyHash(code),
        };
        if (want.legacy_code_hash !== null) legacyHashes += 1;
        const found = await this.prisma.roundClient.findUnique({
          where: { round_id_client_id: { round_id: round.id, client_id: client.id } },
        });
        if (found === null) {
          await this.prisma.roundClient.create({
            data: { round_id: round.id, client_id: client.id, status: 'closed', ...want },
          });
          roundClients.created += 1;
        } else if (
          found.population_snapshot !== want.population_snapshot ||
          !sameDay(found.deadline, want.deadline) ||
          found.legacy_code_hash !== want.legacy_code_hash
        ) {
          await this.prisma.roundClient.update({ where: { id: found.id }, data: want });
          roundClients.updated += 1;
        } else roundClients.unchanged += 1;
      }
    }
    return { rounds, roundClients, legacyHashes };
  }

  /** The whole seed of 1.7 (CLI `seed`): counts only, never codes. */
  async seedAll(input: {
    clients: SeedClient[];
    kundar: Kundar;
    tilgang: Tilgang;
    seedDir: string;
    who: string;
  }) {
    await this.findings.seed(input.seedDir);
    const clients = await this.seedClients(input.clients, input.kundar);
    const templates = await this.seedAllTemplates(input.seedDir, input.who);
    const imports = await this.seedImportRounds(input.kundar, input.tilgang);
    return { clients, templates, ...imports };
  }
}

export const seedDirOf = (configDir: string): string => join(configDir, 'seed');
