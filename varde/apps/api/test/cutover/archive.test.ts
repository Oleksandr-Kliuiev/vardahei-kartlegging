import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ArchiveService, deleteBy } from '../../src/modules/cutover/archive.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { startApp, type TestApp } from '../support/auth-app.js';

let f: TestApp, archive: ArchiveService;
beforeAll(async () => {
  f = await startApp({});
  archive = f.app.get(ArchiveService);
});
afterAll(async () => {
  await f.app
    .get(PrismaService)
    .auditLog.deleteMany({ where: { what: { startsWith: 'cutover.' } } });
  await f.app.close();
});
it('deadline is the minimum of report and cutover plus 90 days', () => {
  expect(deleteBy('2026-10-14', '2026-11-01')).toBe('2026-11-01');
  expect(deleteBy('2026-10-14', '2027-05-01')).toBe('2027-01-12');
});
it('registration and report changes audit deadline bounded by ninety days', async () => {
  await archive.register(randomBytes(32).toString('hex'), '2026-10-14');
  expect((await archive.report('2027-05-01')).delete_by).toBe('2027-01-12');
  expect((await archive.report('2026-12-01')).delete_by).toBe('2026-12-01');
});
it('reminder appears from fourteen days before deadline and after it', async () => {
  expect(await archive.reminder(new Date('2026-11-16T23:59:59Z'))).toBeNull();
  expect(await archive.reminder(new Date('2026-11-17T00:00:00Z'))).toEqual({
    delete_by: '2026-12-01',
    overdue: false,
  });
  expect(await archive.reminder(new Date('2026-12-02'))).toEqual({
    delete_by: '2026-12-01',
    overdue: true,
  });
  expect((await f.get('/api/admin/cutover/reminder')).statusCode).toBe(401);
});
it('restoration and deletion are audited; deletion dismisses reminder', async () => {
  await archive.mark('archive-restored');
  await archive.mark('archive-deleted');
  expect(await archive.reminder(new Date('2027-01-01'))).toBeNull();
  const entries = await f.app
    .get(PrismaService)
    .auditLog.findMany({ where: { what: { startsWith: 'cutover.' } } });
  for (const name of ['archive', 'report-date', 'archive-restored', 'archive-deleted'])
    expect(entries.some((r) => r.what === 'cutover.' + name)).toBe(true);
});
it('invalid dates and hashes are rejected', () => {
  expect(() => deleteBy('2026-02-30')).toThrow();
  expect(() => archive.register('bad', '2026-10-14')).toThrow();
});
