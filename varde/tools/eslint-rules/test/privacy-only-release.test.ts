import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALLOW, globToRegExp, privacyOnlyRelease } from '../rules/privacy-only-release.js';
import { FIXTURE_ROOT, PRISMA_TYPES, typedRuleTester } from './rule-tester.js';

const rule = privacyOnlyRelease as never;
const rounds = `${FIXTURE_ROOT}apps/api/src/modules/rounds/rounds.repository.ts`;
const privacy = `${FIXTURE_ROOT}apps/api/src/modules/privacy/privacy.repository.ts`;
const prismaSeed = `${FIXTURE_ROOT}apps/api/prisma/seed.ts`;
const controller = `${FIXTURE_ROOT}apps/api/src/modules/rounds/rounds.controller.ts`;
const gateway = `${FIXTURE_ROOT}apps/api/src/modules/rounds/rounds.gateway.ts`;

const code = (body: string) => `${PRISMA_TYPES}\n${body}\n`;

const thisPrisma = code(`
class Repo {
  constructor(private readonly prisma: PrismaClient) {}
  count() { return this.prisma.response.count(); }
}
export { Repo };`);
const txAccess = code(
  `void prisma.$transaction((tx: TransactionClient) => tx.response.findMany());`,
);

const VARDE = fileURLToPath(new URL('../../../', import.meta.url));

describe('allow-list', () => {
  it.each(['apps/api/src/modules/rounds/rounds.service.ts', 'apps/api/src/main.ts'])(
    'varde/eslint.config.js enables the rule with exactly DEFAULT_ALLOW for %s',
    async (file) => {
      const eslint = new ESLint({ cwd: VARDE });
      const config = (await eslint.calculateConfigForFile(join(VARDE, file))) as {
        rules?: Record<string, unknown>;
      };
      expect(config.rules?.['varde/privacy-only-release']).toEqual([
        2,
        { allow: [...DEFAULT_ALLOW] },
      ]);
    },
  );

  it('is fixed', () => {
    expect(DEFAULT_ALLOW).toEqual(['apps/api/src/modules/privacy/**', 'apps/api/prisma/**']);
  });

  it('matches paths by glob', () => {
    expect(
      globToRegExp('apps/api/src/modules/privacy/**').test(
        '/x/apps/api/src/modules/privacy/a/b.ts',
      ),
    ).toBe(true);
    expect(
      globToRegExp('apps/api/src/modules/privacy/**').test('/x/apps/api/src/modules/rounds/b.ts'),
    ).toBe(false);
  });
});

typedRuleTester().run('privacy-only-release', rule, {
  valid: [
    {
      name: 'privacy module may read responses',
      filename: privacy,
      code: code(`void prisma.response.findMany();`),
    },
    { name: 'privacy module: this.prisma', filename: privacy, code: thisPrisma },
    {
      name: 'privacy module: raw SQL',
      filename: privacy,
      code: code('void prisma.$queryRaw`select * from response`;'),
    },
    {
      name: 'apps/api/prisma is allowed (seed, migrations)',
      filename: prismaSeed,
      code: code(`void prisma.response.findMany();`),
    },
    {
      name: 'other models are fine',
      filename: rounds,
      code: code(`void prisma.roundClient.findMany({ where: {} });`),
    },
    {
      name: 'a non-Prisma object with a response field',
      filename: rounds,
      code: `declare const http: { response: number }; export const n = http.response;`,
    },
    {
      name: 'raw SQL on other tables',
      filename: rounds,
      code: code('void prisma.$queryRaw`select 1 from round`;'),
    },
    {
      name: 'service imports PrismaService',
      filename: rounds,
      code: `import { PrismaService } from '../../prisma/prisma.service.js';\nexport { PrismaService };`,
    },
  ],
  invalid: [
    {
      name: 'prisma.response.findMany',
      filename: rounds,
      code: code(`void prisma.response.findMany();`),
      errors: [{ messageId: 'model' }],
    },
    {
      name: 'prisma.aggregateSnapshot',
      filename: rounds,
      code: code(`void prisma.aggregateSnapshot.findMany();`),
      errors: [{ messageId: 'model' }],
    },
    {
      name: 'this.prisma.response.count',
      filename: rounds,
      code: thisPrisma,
      errors: [{ messageId: 'model' }],
    },
    {
      name: 'tx.response.findMany inside $transaction',
      filename: rounds,
      code: txAccess,
      errors: [{ messageId: 'model' }],
    },
    {
      name: 'any variable name typed as PrismaClient',
      filename: rounds,
      code: code(`declare const db: PrismaClient & { extra: 1 };\nvoid db['response'].findMany();`),
      errors: [{ messageId: 'model' }],
    },
    {
      name: 'include: { responses: true }',
      filename: rounds,
      code: code(`void prisma.roundClient.findMany({ include: { responses: true } });`),
      errors: [{ messageId: 'relation' }],
    },
    {
      name: 'nested select aggregateSnapshots',
      filename: rounds,
      code: code(
        `void prisma.roundClient.findMany({ select: { round: { include: { aggregateSnapshots: true } } } });`,
      ),
      errors: [{ messageId: 'relation' }],
    },
    {
      name: '$queryRaw on response',
      filename: rounds,
      code: code('void prisma.$queryRaw`select * from response`;'),
      errors: [{ messageId: 'raw' }],
    },
    {
      name: '$queryRawUnsafe on response',
      filename: rounds,
      code: code(`void prisma.$queryRawUnsafe('select * from "Response"');`),
      errors: [{ messageId: 'raw' }],
    },
    {
      name: 'Prisma.sql on aggregate_snapshot',
      filename: rounds,
      code: code('export const q = Prisma.sql`select * from aggregate_snapshot`;'),
      errors: [{ messageId: 'raw' }],
    },
    {
      name: 'PrismaService in a controller',
      filename: controller,
      code: `import { PrismaService } from '../../prisma/prisma.service.js';\nexport { PrismaService };`,
      errors: [{ messageId: 'thin' }],
    },
    {
      name: '@prisma/client in a gateway',
      filename: gateway,
      code: `import type { PrismaClient } from '@prisma/client';\nexport type P = PrismaClient;`,
      errors: [{ messageId: 'thin' }],
    },
  ],
});
