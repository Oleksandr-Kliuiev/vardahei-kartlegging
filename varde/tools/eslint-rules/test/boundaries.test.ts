// Import boundaries (0.2b step 4), checked with the real varde/eslint.config.js.
// Each case writes a temporary file into the real package (type-aware lint needs the file
// on disk inside a tsconfig) and removes it afterwards.
import { mkdirSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, 'eslint.config.js') });
const created: string[] = [];

afterAll(() => {
  for (const path of created) {
    rmSync(path, { force: true });
    const dir = dirname(path);
    if (dir.endsWith('__boundaries__')) {
      rmSync(dir, { recursive: true, force: true });
      removeIfEmpty(dirname(dir));
    }
  }
});

/** A parent created only for the test (e.g. apps/api/src/modules/) must not be left behind. */
function removeIfEmpty(dir: string): void {
  try {
    if (readdirSync(dir).length === 0) rmdirSync(dir);
  } catch {
    // already gone
  }
}

async function ruleIds(rel: string, code: string): Promise<string[]> {
  const full = join(ROOT, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, code);
  created.push(full);
  const [result] = await eslint.lintFiles([full]);
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

describe('import boundaries', () => {
  it('forbids export * everywhere', async () => {
    expect(
      await ruleIds('apps/admin/src/__boundaries__export.ts', `export * from './App.js';\n`),
    ).toContain('no-restricted-syntax');
  });

  it('forbids index.ts barrels in packages/*/src', async () => {
    expect(
      await ruleIds('packages/schema/src/__boundaries__/index.ts', `export const x = 1;\n`),
    ).toContain('no-restricted-syntax');
  });

  it('allows the rules runner/findings entry points', async () => {
    const [result] = await eslint.lintFiles([
      join(ROOT, 'packages/rules/src/runner/index.ts'),
      join(ROOT, 'packages/rules/src/findings/index.ts'),
    ]);
    expect(result?.messages).toEqual([]);
  });

  it.each(['@nestjs/common', '@prisma/client', 'node:fs', '@varde/api', '@varde/rules/findings'])(
    'apps/runner must not import %s',
    async (source) => {
      expect(
        await ruleIds(
          `apps/runner/src/__boundaries__${source.replace(/\W/g, '_')}.ts`,
          `import * as m from '${source}';\nexport const v = m;\n`,
        ),
      ).toContain('no-restricted-imports');
    },
  );

  it('rules/runner must not import rules/findings', async () => {
    expect(
      await ruleIds(
        'packages/rules/src/runner/__boundaries__.ts',
        `import { metricKey } from '../findings/index.js';\nexport const k = metricKey;\n`,
      ),
    ).toContain('no-restricted-imports');
  });

  it('rules/findings must not import rules/runner', async () => {
    expect(
      await ruleIds(
        'packages/rules/src/findings/__boundaries__.ts',
        `import { normalizeEmpty } from '../runner/index.js';\nexport const n = normalizeEmpty;\n`,
      ),
    ).toContain('no-restricted-imports');
  });

  it.each([
    'apps/admin/src/__boundaries__privacy.ts',
    'apps/runner/src/__boundaries__privacy.ts',
    'packages/rules/src/runner/__boundaries__privacy.ts',
  ])('privacy internals are off-limits from %s too', async (rel) => {
    expect(
      await ruleIds(
        rel,
        `import { x } from '../../api/src/modules/privacy/privacy.repository.js';\nexport { x };\n`,
      ),
    ).toContain('no-restricted-imports');
  });

  it('only privacy.service is importable from outside modules/privacy', async () => {
    const dir = 'apps/api/src/modules/__boundaries__';
    expect(
      await ruleIds(
        `${dir}/internal.ts`,
        `import { x } from '../privacy/privacy.repository.js';\nexport { x };\n`,
      ),
    ).toContain('no-restricted-imports');
    expect(
      await ruleIds(
        `${dir}/service.ts`,
        `import { x } from '../privacy/privacy.service.js';\nexport { x };\n`,
      ),
    ).not.toContain('no-restricted-imports');
  });
});
