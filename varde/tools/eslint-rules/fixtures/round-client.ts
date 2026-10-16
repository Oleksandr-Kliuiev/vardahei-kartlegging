// Selfcheck fixture (decision 16.10): a seminar module takes a client's own round_client cells and
// saved per-client findings past varde/round-client-exits. Copied to
// apps/api/src/modules/seminars/__selfcheck__/round-client.ts at run time, then removed. Types are
// declared here by name; the rule matches PrivacyService and the Prisma client by name.

declare class PrivacyService {
  ownCells(round: string, client: string, defs: unknown[]): Promise<unknown[]>;
  adminClientCells(round: string, client: string, defs: unknown[]): Promise<unknown[]>;
}

interface FindingDelegate {
  findMany(): Promise<unknown[]>;
}

interface PrismaClient {
  finding: FindingDelegate;
}

export class SeminarBypass {
  constructor(
    private readonly privacy: PrivacyService,
    private readonly prisma: PrismaClient,
  ) {}

  /** The report's own cells next to all_clients would give a hidden client away. */
  own(): Promise<unknown[]> {
    return this.privacy.ownCells('r', 'c', []);
  }

  admin(): Promise<unknown[]> {
    return this.privacy.adminClientCells('r', 'c', []);
  }

  /** Saved findings of one client carry its numbers. */
  findings(): Promise<unknown[]> {
    return this.prisma.finding.findMany();
  }
}
