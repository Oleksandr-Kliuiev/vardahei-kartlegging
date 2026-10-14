import { defineConfig } from 'vitest/config';

// The rule tests start a full ESLint per case; on a slow CI runner one case takes >5 s.
export default defineConfig({ test: { testTimeout: 30_000 } });
