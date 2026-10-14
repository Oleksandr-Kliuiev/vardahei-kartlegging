import { defineConfig } from 'vitest/config';

// test/golden.test.ts needs chromium (Playwright): job e2e runs it with vitest.golden.config.mts.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], exclude: ['test/golden.test.ts', '**/node_modules/**'] },
});
