import { defineConfig } from 'vitest/config';
import { INTEGRATION_FILES } from './test/support/integration-files.mjs';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: INTEGRATION_FILES,
  },
});
