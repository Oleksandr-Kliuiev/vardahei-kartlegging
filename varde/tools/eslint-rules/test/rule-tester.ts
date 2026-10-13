// Shared RuleTester setup for the eslint-rules tests (type-aware, vitest hooks).
import { RuleTester } from '@typescript-eslint/rule-tester';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, it } from 'vitest';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

export const FIXTURE_ROOT = fileURLToPath(new URL('./fixture-project/', import.meta.url));

export function typedRuleTester(): RuleTester {
  return new RuleTester({
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['apps/api/src/modules/*/*.ts', 'apps/api/prisma/*.ts'],
          defaultProject: 'tsconfig.json',
        },
        tsconfigRootDir: FIXTURE_ROOT,
      },
    },
  });
}

/** Ambient Prisma-like types declared by name (stage 0 has no such models). */
export const PRISMA_TYPES = `
interface Delegate { findMany(args?: unknown): Promise<unknown[]>; count(): Promise<number>; }
interface PrismaClient {
  response: Delegate;
  aggregateSnapshot: Delegate;
  roundClient: Delegate;
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $queryRawUnsafe(sql: string): Promise<unknown>;
  $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
}
interface TransactionClient { response: Delegate; }
declare const prisma: PrismaClient;
declare const Prisma: { sql(strings: TemplateStringsArray, ...values: unknown[]): unknown };
`;
