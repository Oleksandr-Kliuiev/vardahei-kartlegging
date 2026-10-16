// @ts-check
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import varde from './tools/eslint-rules/plugin.js';
import { boundaries } from './tools/eslint-rules/boundaries.js';
import {
  DEFAULT_ALLOW,
  PARTICIPANT_ALLOW,
} from './tools/eslint-rules/rules/privacy-only-release.js';

const root = import.meta.dirname;

/** Workspace packages that depend on @prisma/client (scope of varde/privacy-only-release). */
function prismaPackages() {
  const dirs = new Set(['apps/api']); // api always: the selfcheck fixture lives there (0.2b)
  for (const group of ['apps', 'packages', 'tools']) {
    if (!existsSync(join(root, group))) continue;
    for (const name of readdirSync(join(root, group))) {
      const file = join(root, group, name, 'package.json');
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      if (pkg.dependencies?.['@prisma/client'] || pkg.devDependencies?.['@prisma/client']) {
        dirs.add(`${group}/${name}`);
      }
    }
  }
  return [...dirs];
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.selfcheck/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: root,
      },
    },
    plugins: { import: importPlugin, varde },
    rules: {
      'import/first': 'error',
      'import/no-duplicates': 'error',
      'import/newline-after-import': 'error',
      'import/no-mutable-exports': 'error',
    },
  },
  {
    files: prismaPackages().map((dir) => `${dir}/**/*.{ts,tsx}`),
    rules: {
      'varde/privacy-only-release': [
        'error',
        { allow: [...DEFAULT_ALLOW], participants: [...PARTICIPANT_ALLOW] },
      ],
    },
  },
  ...boundaries,
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
