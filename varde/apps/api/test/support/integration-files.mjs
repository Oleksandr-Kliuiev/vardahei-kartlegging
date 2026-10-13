// Integration test files (Postgres). Excluded from `pnpm test`, run by `pnpm test:integration`.
export const INTEGRATION_FILES = [
  'test/migrations.test.ts',
  'test/audit-log.test.ts',
  'test/seed.test.ts',
  'test/prisma-lazy.test.ts',
  'test/db-roles.test.ts',
  'test/jobs.test.ts',
  'test/admin-session.test.ts',
  'test/stub-removed.test.ts',
  'test/break-glass-prisma.test.ts',
  'test/privacy/rows.test.ts',
  'test/surveys/template-version.test.ts',
  'test/surveys/publish.test.ts',
  'test/response-constraints.test.ts',
  'test/privacy/prisma-source.test.ts',
];
