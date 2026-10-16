// 3.3 (integration): material of a seminar — a title and an http(s) link, no uploads. The admin
// adds and removes it (AuditLog); the seminar page shows it only after the seminar, to everyone
// with the link.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withPg } from '../support/rounds.js';
import { createSeminar, seminarApp, type SeminarApp } from '../support/seminars.js';

let t: SeminarApp;
beforeAll(async () => {
  t = await seminarApp();
}, 120_000);
afterAll(async () => {
  await t.close();
});

const pub = (code: string) =>
  t.call('GET', '/api/public/seminar', undefined, { cookie: '', authorization: `Bearer ${code}` });

describe('material of a seminar (3.3)', () => {
  it('needs an admin session', async () => {
    const s = await createSeminar(t);
    expect(
      (await t.call('POST', `/api/admin/seminars/${s.id}/materials`, { title: 'x', url: 'https://example.test' }, { cookie: '' })).statusCode,
    ).toBe(401);
  });

  it('adds titles and links (AuditLog), lists them in order and removes one', async () => {
    const s = await createSeminar(t);
    const add = (title: string, url: string) => t.call('POST', `/api/admin/seminars/${s.id}/materials`, { title, url });
    expect((await add('Lysark', 'https://example.test/lysark.pdf')).statusCode).toBe(201);
    const second = await add('Opptak av seminaret', 'https://example.test/video?id=1');
    expect(second.statusCode).toBe(201);
    const view = (await t.call('GET', `/api/admin/seminars/${s.id}`)).json<{ materials: { id: string; title: string; url: string }[] }>();
    expect(view.materials.map((m) => m.title)).toEqual(['Lysark', 'Opptak av seminaret']);
    expect(await t.prisma.auditLog.count({ where: { what: 'seminars.material.add', target: `seminar:${s.id}` } })).toBe(2);
    const id = second.json<{ id: string }>().id;
    expect((await t.call('DELETE', `/api/admin/seminars/${s.id}/materials/${id}`)).statusCode).toBe(200);
    expect((await t.call('DELETE', `/api/admin/seminars/${s.id}/materials/${id}`)).statusCode).toBe(404);
    expect((await t.call('GET', `/api/admin/seminars/${s.id}`)).json<{ materials: unknown[] }>().materials).toHaveLength(1);
    expect(await t.prisma.auditLog.count({ where: { what: 'seminars.material.remove', target: `seminar:${s.id}` } })).toBe(1);
  });

  it('only http(s) links without a user or password; a title is needed', async () => {
    const s = await createSeminar(t);
    const add = (title: string, url: string) => t.call('POST', `/api/admin/seminars/${s.id}/materials`, { title, url });
    for (const url of ['javascript:alert(1)', 'ftp://example.test/x', 'https://user:pw@example.test/x', 'example.test/x', 'https://example.test/a b'])
      expect((await add('Lysark', url)).statusCode, url).toBe(400);
    expect((await add('Lysark', 'javascript:alert(1)')).json<{ message: string }>().message).toBe(
      'Lenkja må byrje med https:// (eller http://).',
    );
    expect((await add(' ', 'https://example.test')).statusCode).toBe(400);
    expect((await t.call('POST', `/api/admin/seminars/${randomUUID()}/materials`, { title: 'x', url: 'https://example.test' })).statusCode).toBe(404);
    await expect(
      withPg((c) =>
        c.query(`INSERT INTO seminar_material (seminar_id, title, url, created_by) VALUES ($1, 'x', 'javascript:x', 'test')`, [s.id]),
      ),
    ).rejects.toThrow(/seminar_material_check/);
  });

  it('the seminar page shows the material only after the seminar, without ids', async () => {
    const coming = await createSeminar(t);
    const held = await createSeminar(t, { date: '2020-03-04' });
    for (const s of [coming, held])
      await t.call('POST', `/api/admin/seminars/${s.id}/materials`, { title: 'Lysark', url: 'https://example.test/lysark.pdf' });
    const before = (await pub(coming.code)).json<{ phase: string; materials: unknown[] }>();
    expect(before).toMatchObject({ phase: 'open', materials: [] });
    const after = (await pub(held.code)).json<{ phase: string; materials: unknown[] }>();
    expect(after).toMatchObject({ phase: 'held', materials: [{ title: 'Lysark', url: 'https://example.test/lysark.pdf' }] });
    expect(Object.keys((after.materials[0] as object))).toEqual(['title', 'url']);
  });
});
