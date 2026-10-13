// Integration test files (Postgres). Excluded from `pnpm test`, run by `pnpm test:integration`.
export const INTEGRATION_FILES = [
  'test/migrations.test.ts',
  'test/audit-log.test.ts',
  'test/seed.test.ts',
  'test/prisma-lazy.test.ts',
  'test/db-roles.test.ts',
  'test/jobs.test.ts',
  'test/admin-session.test.ts',
];
