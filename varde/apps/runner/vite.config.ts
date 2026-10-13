import { defineConfig } from 'vitest/config';

// Workspace packages resolve to their TypeScript sources (export condition `source`, 1.4b);
// the rest are Vite's default client conditions.
export default defineConfig({
  resolve: { conditions: ['source', 'module', 'browser', 'development|production'] },
  test: {
    environment: 'jsdom',
  },
});
