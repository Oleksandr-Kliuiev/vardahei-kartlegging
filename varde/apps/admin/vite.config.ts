import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Workspace packages resolve to their TypeScript sources (export condition `source`, as in the runner),
// so a fresh checkout does not need packages built to dist before admin tests and builds.
export default defineConfig({
  base: '/admin/',
  resolve: { conditions: ['source', 'module', 'browser', 'development|production'] },
  build: { assetsInlineLimit: 0 },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
