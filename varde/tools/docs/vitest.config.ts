import { defineConfig } from 'vitest/config';

// Task 0.13: strict mode of the Anthropic checklist (gate G0). Vitest rejects unknown options,
// but arguments after `--` — `pnpm --filter @varde/tools-docs test -- anthropic-checklist
// --require-complete` passes them that way — reach only this config, which runs in the main
// process; the test reads the flag with inject(). VARDE_REQUIRE_COMPLETE=1 does the same.
const requireComplete =
  process.argv.includes('--require-complete') || process.env.VARDE_REQUIRE_COMPLETE === '1';

declare module 'vitest' {
  export interface ProvidedContext {
    requireComplete: boolean;
  }
}

// Workspace packages resolve to their TypeScript sources in tests (export condition `source`).
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: { provide: { requireComplete } },
});
