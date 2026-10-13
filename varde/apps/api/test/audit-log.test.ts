import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';

const prisma = new PrismaService();
const marker = `test.audit.${Date.now()}`;

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { what: marker } });
  await prisma.$disconnect();
});

describe('AuditLog', () => {
  it('writes and reads an entry with defaults and jsonb details', async () => {
    const created = await prisma.auditLog.create({
      data: {
        who: 'test',
        what: marker,
        target: 'round:1',
        details: { round: 1, client: 'x', count: 3 },
      },
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.at).toBeInstanceOf(Date);

    const read = await prisma.auditLog.findUniqueOrThrow({ where: { id: created.id } });
    expect(read).toMatchObject({ who: 'test', what: marker, target: 'round:1' });
    expect(read.details).toEqual({ round: 1, client: 'x', count: 3 });
  });

  it('allows target and details to be empty', async () => {
    const created = await prisma.auditLog.create({ data: { who: 'test', what: marker } });
    expect(created.target).toBeNull();
    expect(created.details).toBeNull();
  });
});
