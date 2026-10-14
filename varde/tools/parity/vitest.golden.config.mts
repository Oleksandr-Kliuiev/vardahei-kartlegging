import { defineConfig } from 'vitest/config';

// Browser part of 1.2c (job e2e, after `playwright install chromium`).
export default defineConfig({
  test: { include: ['test/golden.test.ts'], testTimeout: 180_000 },
});
