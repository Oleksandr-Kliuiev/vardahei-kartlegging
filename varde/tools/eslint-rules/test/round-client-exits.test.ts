// varde/round-client-exits (decision 16.10): a client's own round_client cells leave privacy only
// to its own channel and to the admin dashboard; saved per-client findings likewise.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import {
  FINDING_ALLOW,
  OWN_CHANNEL,
  ROUND_CLIENT_EXITS,
  roundClientExits,
} from '../rules/round-client-exits.js';
import { FIXTURE_ROOT, typedRuleTester } from './rule-tester.js';

const rule = roundClientExits as never;
const file = (module: string, name: string) =>
  `${FIXTURE_ROOT}apps/api/src/modules/${module}/${name}`;
const reports = file('reports', 'report.service.ts');
const csv = file('exports', 'csv.service.ts');
const archive = file('exports', 'round-archive.service.ts');
const metrics = file('metrics', 'metrics.service.ts');
const dashboard = file('dashboard', 'aggregate-view.ts');
const preview = file('findings', 'rule-preview.service.ts');
const findings = file('findings', 'findings.service.ts');
const retention = file('retention', 'handover.ts');
const privacyCohort = file('privacy', 'cohort.ts');
const seminars = file('seminars', 'seminars.service.ts');

/** PrivacyService and a Prisma client declared by name, as the rule matches them. */
const TYPES = `
declare class PrivacyService {
  ownCells(round: string, client: string, defs: unknown[]): Promise<unknown[]>;
  adminClientCells(round: string, client: string, defs: unknown[]): Promise<unknown[]>;
  viewCells(round: string, population: string, defs: unknown[]): Promise<unknown[]>;
  clientGroup(round: string, defs: unknown[], clients: string[]): Promise<unknown>;
  releasedRoundClients(rounds: string[]): Promise<Set<string>>;
  roleClientCells(round: string, defs: unknown[], role: string): Promise<unknown[]>;
  cohortCells(round: string, clients: string[], defs: unknown[]): Promise<unknown[]>;
  computeCells(round: string, population: string, defs: unknown[]): Promise<unknown[]>;
  aggregate(query: unknown): Promise<unknown>;
  archiveSnapshots(round: string): Promise<unknown[]>;
  handover(client: string, reason: string): Promise<unknown>;
}
interface Delegate {
  findMany(args?: unknown): Promise<unknown[]>;
  findFirst(args?: unknown): Promise<unknown>;
  count(args?: unknown): Promise<number>;
  aggregate(args?: unknown): Promise<unknown>;
}
interface PrismaClient {
  finding: Delegate;
  findingStatus: Delegate;
  templateVersion: Delegate;
  $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
}
interface TransactionClient { finding: Delegate; }
declare const privacy: PrivacyService;
declare const prisma: PrismaClient;
declare const defs: unknown[];
`;
const code = (body: string) => `${TYPES}\n${body}\nexport {};\n`;
const call = (method: string, args = `'r', 'c', defs`) => code(`void privacy.${method}(${args});`);

const VARDE = fileURLToPath(new URL('../../../', import.meta.url));

describe('allow-lists', () => {
  it('are fixed', () => {
    expect(ROUND_CLIENT_EXITS).toEqual({
      ownCells: [
        'apps/api/src/modules/reports/**',
        'apps/api/src/modules/exports/csv.service.ts',
        'apps/api/src/modules/metrics/metrics.service.ts',
      ],
      handover: ['apps/api/src/modules/retention/**'],
      adminClientCells: [
        'apps/api/src/modules/dashboard/**',
        'apps/api/src/modules/findings/rule-preview.service.ts',
      ],
      roleClientCells: ['apps/api/src/modules/dashboard/**'],
      cohortCells: ['apps/api/src/modules/dashboard/**'],
      computeCells: ['apps/api/src/modules/metrics/metrics.service.ts'],
      aggregate: [],
      archiveSnapshots: ['apps/api/src/modules/exports/round-archive.service.ts'],
    });
    expect(OWN_CHANNEL).toEqual([
      'apps/api/src/modules/reports/**',
      'apps/api/src/modules/exports/csv.service.ts',
      'apps/api/src/modules/retention/handover.ts',
    ]);
    expect(FINDING_ALLOW).toEqual([
      'apps/api/src/modules/findings/**',
      'apps/api/src/modules/reports/**',
      'apps/api/src/modules/exports/round-archive.service.ts',
    ]);
  });

  it.each([
    ['apps/api/src/modules/seminars/seminars.service.ts', [2]],
    ['apps/api/src/modules/reports/report.service.ts', [2]],
    ['apps/api/src/main.ts', [2]],
    ['apps/api/src/modules/privacy/privacy.service.ts', undefined],
    ['apps/admin/src/main.tsx', undefined],
  ])('varde/eslint.config.js: %s → %j', async (path, expected) => {
    const eslint = new ESLint({ cwd: VARDE });
    const config = (await eslint.calculateConfigForFile(join(VARDE, path))) as {
      rules?: Record<string, unknown>;
    };
    expect(config.rules?.['varde/round-client-exits']).toEqual(expected);
  });
});

typedRuleTester().run('round-client-exits', rule, {
  valid: [
    { name: 'report 5.1 reads its own cells', filename: reports, code: call('ownCells') },
    { name: 'client CSV reads its own cells', filename: csv, code: call('ownCells') },
    {
      name: 'the release computes cells and the findings of each client and of all clients',
      filename: metrics,
      code: code(
        `void privacy.computeCells('r', 'round_client', defs);\nvoid privacy.ownCells('r', 'c', defs);\nvoid privacy.viewCells('r', 'all_clients', defs);`,
      ),
    },
    {
      name: 'the admin dashboard reads one client, the role grid and the cohort',
      filename: dashboard,
      code: code(
        `void privacy.adminClientCells('r', 'c', defs);\nvoid privacy.roleClientCells('r', defs, 'x');\nvoid privacy.cohortCells('r', ['c'], defs);`,
      ),
    },
    { name: 'rule preview of the dashboard', filename: preview, code: call('adminClientCells') },
    { name: 'return of the client data', filename: retention, code: call('handover', `'c', 'r'`) },
    { name: 'round archive', filename: archive, code: call('archiveSnapshots', `'r'`) },
    {
      name: 'every module may read all_clients and seminar groups',
      filename: seminars,
      code: code(
        `void privacy.viewCells('r', 'all_clients', defs);\nvoid privacy.clientGroup('r', defs, ['c']);\nvoid privacy.releasedRoundClients(['r']);\nconst { viewCells } = privacy;\nvoid viewCells;`,
      ),
    },
    {
      name: 'inside privacy anything goes',
      filename: privacyCohort,
      code: code(`void privacy.ownCells('r', 'c', defs);\nvoid privacy.aggregate({});`),
    },
    {
      name: 'aggregate of a Prisma delegate is not privacy',
      filename: seminars,
      code: code(`void prisma.templateVersion.aggregate({});`),
    },
    {
      name: 'findings, the report and the archive read saved findings',
      filename: findings,
      code: code(`void prisma.finding.findMany();`),
    },
    {
      name: 'report reads findings',
      filename: reports,
      code: code(`void prisma.finding.findMany();`),
    },
    {
      name: 'archive reads findings',
      filename: archive,
      code: code(`void prisma.finding.findMany();`),
    },
    {
      name: 'count and a select without numbers tell nothing per client',
      filename: seminars,
      code: code(
        `void prisma.finding.count({ where: { id: 'x' } });\nvoid prisma.findingStatus.findMany({ select: { finding: { select: { rule_key: true, client_id: true } } } });`,
      ),
    },
  ],
  invalid: [
    ...(
      [
        ['ownCells', undefined],
        ['adminClientCells', undefined],
        ['roleClientCells', `'r', defs, 'x'`],
        ['cohortCells', `'r', ['c'], defs`],
        ['computeCells', `'r', 'round_client', defs`],
        ['aggregate', `{}`],
        ['archiveSnapshots', `'r'`],
        ['handover', `'c', 'r'`],
      ] as const
    ).map(([method, args]) => ({
      name: `${method} from a seminar module`,
      filename: seminars,
      code: call(method, args),
      errors: [{ messageId: 'exit' as const }],
    })),
    {
      name: 'a report never reads the live admin view',
      filename: reports,
      code: call('adminClientCells'),
      errors: [{ messageId: 'exit' }],
    },
    {
      name: 'the dashboard has no own channel',
      filename: dashboard,
      code: call('ownCells'),
      errors: [{ messageId: 'exit' }],
    },
    {
      name: 'the report puts no shared numbers next to its own cells',
      filename: reports,
      code: code(
        `void privacy.ownCells('r', 'c', defs);\nvoid privacy.viewCells('r', 'all_clients', defs);`,
      ),
      errors: [{ messageId: 'mixed' }],
    },
    {
      name: 'the client CSV takes no seminar group',
      filename: csv,
      code: call('clientGroup', `'r', defs, ['c']`),
      errors: [{ messageId: 'mixed' }],
    },
    {
      name: 'the return of client data takes no shared view, destructured either',
      filename: retention,
      code: code(`const { viewCells } = privacy;\nvoid viewCells;`),
      errors: [{ messageId: 'mixed' }],
    },
    {
      name: 'the client CSV takes no other client',
      filename: csv,
      code: call('adminClientCells'),
      errors: [{ messageId: 'exit' }],
    },
    {
      name: 'destructured',
      filename: seminars,
      code: code(`const { ownCells, viewCells } = privacy;\nvoid ownCells;\nvoid viewCells;`),
      errors: [{ messageId: 'exit' }],
    },
    {
      name: 'computed with a literal',
      filename: seminars,
      code: code(`void privacy['ownCells']('r', 'c', defs);`),
      errors: [{ messageId: 'exit' }],
    },
    {
      name: 'computed with a variable',
      filename: seminars,
      code: code(`const m = 'viewCells' as 'viewCells' | 'ownCells';\nvoid privacy[m];`),
      errors: [{ messageId: 'dynamic' }],
    },
    {
      name: 'rest of PrivacyService',
      filename: seminars,
      code: code(`const { viewCells, ...rest } = privacy;\nvoid viewCells;\nvoid rest;`),
      errors: [{ messageId: 'dynamic' }],
    },
    {
      name: 'a receiver typed any',
      filename: seminars,
      code: code(`declare const p: any;\nvoid p.ownCells('r', 'c', defs);`),
      errors: [{ messageId: 'exit' }],
    },
    {
      name: 'saved findings from a seminar module',
      filename: seminars,
      code: code(`void prisma.finding.findMany({ where: { client_id: 'c' } });`),
      errors: [{ messageId: 'finding' }],
    },
    {
      name: 'saved findings in a transaction',
      filename: seminars,
      code: code(`void prisma.$transaction((tx: TransactionClient) => tx.finding.findFirst());`),
      errors: [{ messageId: 'finding' }],
    },
    {
      name: 'saved findings through include',
      filename: seminars,
      code: code(`void prisma.findingStatus.findMany({ include: { finding: true } });`),
      errors: [{ messageId: 'finding' }],
    },
    {
      name: 'saved findings through a select with numbers',
      filename: seminars,
      code: code(
        `void prisma.findingStatus.findMany({ select: { finding: { select: { numbers: true } } } });`,
      ),
      errors: [{ messageId: 'finding' }],
    },
  ],
});
