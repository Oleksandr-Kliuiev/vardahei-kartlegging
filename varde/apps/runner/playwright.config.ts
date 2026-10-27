import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // CI skips paths.spec when nothing it compares against changed (varde.yml, job changes)
  testIgnore: process.env.VARDE_SKIP_PATHS?.trim() ? /paths\.spec\.ts$/ : [],
  globalSetup: './e2e/global-setup.mjs',
  workers: 1,
  use: { baseURL: process.env.RUNNER_BASE_URL ?? 'http://127.0.0.1:3098', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
