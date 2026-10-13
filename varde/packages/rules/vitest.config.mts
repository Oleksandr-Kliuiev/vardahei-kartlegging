import { defineConfig } from 'vitest/config';

// Workspace packages resolve to their TypeScript sources in tests (export condition `source`);
// Node at run time uses `default` → dist (1.4b).
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
});
