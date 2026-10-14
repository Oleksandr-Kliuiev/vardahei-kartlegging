import { defineConfig } from 'vitest/config';
import { INTEGRATION_FILES } from './test/support/integration-files.mjs';

// Workspace packages resolve to their TypeScript sources in tests (export condition `source`, 1.4b).
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['test/**/*.test.ts'],
    exclude: INTEGRATION_FILES,
  },
});
