import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Workspace packages resolve to their TypeScript sources (export condition `source`, 1.4b);
// the rest are Vite's default client conditions.
export default defineConfig({
  base: '/r/',
  // Three pages: the survey (`/r`), the seminar page (`/s`, 3.2) and the big screen of a seminar
  // live poll (`/p`, 3.5); shared code is split once.
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        seminar: resolve(import.meta.dirname, 'seminar.html'),
        presenter: resolve(import.meta.dirname, 'presenter.html'),
      },
    },
  },
  resolve: { conditions: ['source', 'module', 'browser', 'development|production'] },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
