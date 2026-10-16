// Import boundaries (task 0.2b, PRINCIPLES §12–13). Used by varde/eslint.config.js.
// Blocks that target the same files replace each other's rule options, so every block
// that sets `no-restricted-syntax` repeats the global `export *` ban, and every block that
// sets `no-restricted-imports` repeats the privacy-internal ban (it applies to any module).

const EXPORT_ALL = {
  selector: 'ExportAllDeclaration',
  message: '`export * from` is not allowed: import directly from the module (no barrels).',
};
const BARREL_INDEX = {
  selector: 'Program',
  message:
    'index.ts in packages/*/src is a barrel; only @varde/rules runner/findings entry points are allowed.',
};

/** `ReleasedSnapshot` is a brand type: only modules/privacy may assert it (1.10b). */
const RELEASED_CAST = [
  {
    selector: "TSAsExpression[typeAnnotation.typeName.name='ReleasedSnapshot']",
    message: 'Only modules/privacy (markReleased) builds a ReleasedSnapshot (ADR-021, 1.10b).',
  },
  {
    selector: "TSTypeAssertion[typeAnnotation.typeName.name='ReleasedSnapshot']",
    message: 'Only modules/privacy (markReleased) builds a ReleasedSnapshot (ADR-021, 1.10b).',
  },
];
/** Where the brand may be asserted: the privacy module and the tests of the schema itself. */
const RELEASED_CAST_ALLOWED = [
  'apps/api/src/modules/privacy/**',
  'packages/schema/test/**',
  'tools/eslint-rules/fixtures/**', // the selfcheck fixture; its copy in apps/api is linted
];

/** Storage constructors are private to privacy; test fixtures may instantiate them. */
const PRIVATE_STORAGE = [
  'PrismaResponseSource',
  'ResponseStore',
  'ParticipantStore',
  'PrivacyService',
].flatMap((name) => [
  {
    selector: `NewExpression[callee.name='${name}']`,
    message: `Only modules/privacy may construct ${name}; use PrivacyService (ADR-021).`,
  },
  {
    selector: `NewExpression[callee.type='MemberExpression'][callee.property.name='${name}']`,
    message: `Only modules/privacy may construct ${name}; use PrivacyService (ADR-021).`,
  },
]);

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
    ignores: RELEASED_CAST_ALLOWED,
    rules: { 'no-restricted-syntax': ['error', EXPORT_ALL, ...RELEASED_CAST] },
  },
  {
    ignores: ['apps/api/src/modules/privacy/**'],
    rules: { 'varde/privacy-internals': 'error' },
  },
  {
    files: [
      'apps/*/src/**/*.{ts,tsx}',
      'packages/*/src/**/*.{ts,tsx}',
      'tools/*/src/**/*.{ts,tsx}',
    ],
    ignores: ['apps/api/src/modules/privacy/**'],
    rules: { 'no-restricted-syntax': ['error', EXPORT_ALL, ...RELEASED_CAST, ...PRIVATE_STORAGE] },
  },
  {
    files: ['packages/*/src/**/index.ts'],
    ignores: ['packages/rules/src/runner/index.ts', 'packages/rules/src/findings/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        EXPORT_ALL,
        BARREL_INDEX,
        ...RELEASED_CAST,
        ...PRIVATE_STORAGE,
      ],
    },
  },
  {
    files: ['apps/runner/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PRIVACY_INTERNAL,
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
            PRIVACY_INTERNAL,
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
            PRIVACY_INTERNAL,
            {
              regex: '(^|/)runner(/|$)',
              message: 'rules/findings must not import rules/runner.',
            },
          ],
        },
      ],
    },
  },
];
