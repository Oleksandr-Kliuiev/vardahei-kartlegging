import { defineConfig } from 'vitest/config';
import { INTEGRATION_FILES } from './test/support/integration-files.mjs';

// Integration tests on Postgres: DATABASE_URL must point to a database whose user may
// CREATE DATABASE (migrations.test.ts works on its own temporary database).
export default defineConfig({
  test: {
    include: INTEGRATION_FILES,
    globalSetup: ['test/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
