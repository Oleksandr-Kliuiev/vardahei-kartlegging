// Fixture for `pnpm lint:privacy:selfcheck`: a privacy bypass with no other lint errors.
// Copied to apps/api/src/modules/__selfcheck__/bypass.ts at run time, then removed.
// Types are declared here by name: stage 0 has no Response model in Prisma yet.

interface ResponseDelegate {
  findMany(): Promise<unknown[]>;
}

interface PrismaClient {
  response: ResponseDelegate;
  $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
}

interface TransactionClient {
  response: ResponseDelegate;
}

export class BypassRepository {
  constructor(private readonly prisma: PrismaClient) {}

  all(): Promise<unknown[]> {
    return this.prisma.response.findMany();
  }

  inTransaction(): Promise<unknown[]> {
    return this.prisma.$transaction((tx: TransactionClient) => tx.response.findMany());
  }
}
