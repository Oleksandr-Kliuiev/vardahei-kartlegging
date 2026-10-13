// Import boundaries (task 0.2b, PRINCIPLES §12–13). Used by varde/eslint.config.js.
// Blocks that target the same files replace each other's rule options, so every block
// that sets `no-restricted-syntax` repeats the global `export *` ban.

const EXPORT_ALL = {
  selector: 'ExportAllDeclaration',
  message: '`export * from` is not allowed: import directly from the module (no barrels).',
};
const BARREL_INDEX = {
  selector: 'Program',
  message:
    'index.ts in packages/*/src is a barrel; only @varde/rules runner/findings entry points are allowed.',
};

/** Allowed entry into the privacy module from outside it (0.15b). */
const PRIVACY_INTERNAL = {
  regex: '(^|/)privacy/(?!privacy\\.service(\\.js)?$)[^/]+',
  message: 'Outside modules/privacy only modules/privacy/privacy.service may be imported.',
};

/** @type {import('eslint').Linter.Config[]} */
export const boundaries = [
  {
    rules: { 'no-restricted-syntax': ['error', EXPORT_ALL] },
  },
  {
    files: ['packages/*/src/**/index.ts'],
    ignores: ['packages/rules/src/runner/index.ts', 'packages/rules/src/findings/index.ts'],
    rules: { 'no-restricted-syntax': ['error', EXPORT_ALL, BARREL_INDEX] },
  },
  {
    files: ['apps/runner/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(@varde/api(/.*)?|@nestjs/.*|@prisma/.*|node:.*|@varde/rules/findings)$',
              message: 'apps/runner must not pull server code or @varde/rules/findings.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/rules/src/runner/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)findings(/|$)',
              message: 'rules/runner must not import rules/findings.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/rules/src/findings/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)runner(/|$)',
              message: 'rules/findings must not import rules/runner.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/modules/privacy/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [PRIVACY_INTERNAL] }] },
  },
];
