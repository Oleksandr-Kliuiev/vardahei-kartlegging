// Fixture for `pnpm lint:privacy:selfcheck`: privacy bypasses from a dashboard module with no
// other lint errors (0.19b). Copied to apps/api/src/modules/dashboard/__selfcheck__/bypass.ts at
// run time, then removed. Types are declared here by name: stage 0 has no Response model yet.

interface ResponseDelegate {
  findMany(): Promise<unknown[]>;
}

interface RoundClientDelegate {
  findMany(args: { include: { responses: boolean } }): Promise<unknown[]>;
}

interface PrismaClient {
  response: ResponseDelegate;
  roundClient: RoundClientDelegate;
  registration: ResponseDelegate;
  $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
}

interface TransactionClient {
  response: ResponseDelegate;
  roundClient: RoundClientDelegate;
}

export class DashboardBypass {
  constructor(private readonly prisma: PrismaClient) {}

  inTransaction(): Promise<unknown[]> {
    return this.prisma.$transaction((tx: TransactionClient) => tx.response.findMany());
  }

  throughInclude(): Promise<unknown[]> {
    return this.prisma.roundClient.findMany({ include: { responses: true } });
  }

  /** Seminar participants (3.1): names and e-mail only through privacy/participants.ts. */
  participants(): Promise<unknown[]> {
    return this.prisma.registration.findMany();
  }
}
