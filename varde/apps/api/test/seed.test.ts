import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { seed } from '../prisma/seed.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { API_DIR } from './support/prisma-cli.js';

const prisma = new PrismaService();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seed', () => {
  it('is idempotent: repeated runs leave one seed.run row', async () => {
    await seed(prisma);
    await seed(prisma);
    const cli = spawnSync(
      process.execPath,
      [join(API_DIR, 'node_modules/tsx/dist/cli.mjs'), 'prisma/seed.ts'],
      {
        cwd: API_DIR,
        encoding: 'utf8',
      },
    );
    expect(cli.status, `${cli.stdout}${cli.stderr}`).toBe(0);
    expect(await prisma.auditLog.count({ where: { what: 'seed.run' } })).toBe(1);
  });
});
