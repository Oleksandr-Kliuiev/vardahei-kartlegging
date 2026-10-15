import { defineConfig } from 'vitest/config';

// Workspace packages resolve to their TypeScript sources in tests (export condition `source`).
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
});
