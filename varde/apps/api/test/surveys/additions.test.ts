// 2.18 (integration): what went out by hand (invitation, reminder, report) and notes on questions in
// the workshop — admins only, every change in AuditLog, the text of a note never in it.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TemplateContent } from '@varde/schema/template/template';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { editorContent } from '../support/editor-content.js';
import { startApp, type TestApp } from '../support/auth-app.js';

let t: TestApp, db: PrismaService, cookie: string;
const who = `test-additions-${randomUUID()}`,
  run = randomUUID().slice(0, 8),
  key = `tillegg-${run}`;
const rounds: string[] = [],
  clients: string[] = [];
let template = '';
interface Version {
  id: string;
  template_id: string;
  content_hash: string;
  content: TemplateContent;
}
const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, signed = true) =>
  t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      ...(signed ? { headers: { cookie: `varde_session=${encodeURIComponent(cookie)}` } } : {}),
    });
const path = (id: string) => `/api/admin/surveys/versions/${id}`;

/** A survey of its own, published: draft, full content, both languages approved. */
async function published(): Promise<Version> {
  const made = (
    await call('POST', '/api/admin/surveys', {
      key,
      audience: 'client_survey',
      identification: 'none',
      required_languages: ['nn', 'en'],
    })
  ).json<Version>();
  template = made.template_id;
  const saved = (
    await call('PUT', path(made.id), {
      content_hash: made.content_hash,
      content: editorContent(key),
    })
  ).json<Version>();
  for (const lang of ['nn', 'en'])
    await call('POST', `${path(made.id)}/accept`, { content_hash: saved.content_hash, lang });
  const r = await call('POST', `${path(made.id)}/publish`, {
    content_hash: saved.content_hash,
    confirmed: true,
  });
  expect(r.statusCode).toBe(201);
  return saved;
}

beforeAll(async () => {
  t = await startApp({ PUBLIC_URL: 'https://example.invalid' });
  db = t.app.get(PrismaService);
  const session = await t.store.create({
    oid: who,
    name: 'Syntetisk Admin',
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  cookie = t.app.getHttpAdapter().getInstance().signCookie(session.sid);
  await db.adminSession.create({
    data: {
      oid: who,
      name: 'Syntetisk Admin',
      via: 'entra',
      expires_at: new Date(Date.now() + 3600_000),
    },
  });
});
afterAll(async () => {
  await db.roundClient.deleteMany({ where: { round_id: { in: rounds } } });
  await db.round.deleteMany({ where: { id: { in: rounds } } });
  await db.client.deleteMany({ where: { id: { in: clients } } });
  if (template) {
    await db.questionComment.deleteMany({ where: { template_id: template } });
    await db.$executeRawUnsafe(
      'ALTER TABLE template_version DISABLE TRIGGER template_version_immutable',
    );
    await db.templateVersion.deleteMany({ where: { template_id: template } });
    await db.$executeRawUnsafe(
      'ALTER TABLE template_version ENABLE TRIGGER template_version_immutable',
    );
    await db.surveyTemplate.deleteMany({ where: { id: template } });
  }
  await db.auditLog.deleteMany({ where: { who } });
  await db.adminSession.deleteMany({ where: { oid: who } });
  await t.app.close();
});

describe('sent by hand and notes on questions (2.18)', () => {
  let version: Version;
  beforeAll(async () => {
    version = await published();
  });

  it('sent marks: set, read back with the round, taken back; each change audited', async () => {
    const round = (
      await call('POST', '/api/admin/rounds', {
        name: `Sendt ${run}`,
        template_version_id: version.id,
      })
    ).json<{ id: string }>();
    rounds.push(round.id);
    const client = await db.client.create({
      data: { slug: `sendt-${run}`, name: `Syntetisk sendt ${run}`, employee_count: 5 },
    });
    clients.push(client.id);
    const rc = (
      await call('POST', `/api/admin/rounds/${round.id}/clients`, {
        client_id: client.id,
        deadline: '2099-06-01',
      })
    ).json<{ id: string }>();
    const url = `/api/admin/round-clients/${rc.id}/sent`;
    expect((await call('PUT', url, { kind: 'invitation', sent: true }, false)).statusCode).toBe(
      401,
    );
    expect((await call('PUT', url, { kind: 'brev', sent: true })).statusCode).toBe(400);
    expect(
      (
        await call('PUT', `/api/admin/round-clients/${randomUUID()}/sent`, {
          kind: 'report',
          sent: true,
        })
      ).statusCode,
    ).toBe(404);
    const marked = await call('PUT', url, { kind: 'invitation', sent: true });
    expect(marked.statusCode).toBe(200);
    const listed = () =>
      call('GET', '/api/admin/rounds').then(
        (r) =>
          r
            .json<{ id: string; round_clients: Record<string, unknown>[] }[]>()
            .find((x) => x.id === round.id)!.round_clients[0]!,
      );
    expect(await listed()).toMatchObject({
      invitation_sent_at: expect.any(String) as unknown,
      reminder_sent_at: null,
      report_sent_at: null,
    });
    await call('PUT', url, { kind: 'reminder', sent: true });
    await call('PUT', url, { kind: 'invitation', sent: false });
    expect(await listed()).toMatchObject({
      invitation_sent_at: null,
      reminder_sent_at: expect.any(String) as unknown,
    });
    const audit = await db.auditLog.findMany({
      where: { who, what: 'rounds.client.sent', target: `round_client:${rc.id}` },
      orderBy: { at: 'asc' },
    });
    expect(audit.map((a) => a.details)).toEqual([
      { kind: 'invitation', sent: true },
      { kind: 'reminder', sent: true },
      { kind: 'invitation', sent: false },
    ]);
  });

  it('notes: written on a question, read with name and version, solved and opened again; they follow the next draft', async () => {
    const text = `Kan vi seie dette enklare? ${run}`;
    expect((await call('GET', `${path(version.id)}/comments`, undefined, false)).statusCode).toBe(
      401,
    );
    expect(
      (await call('POST', `${path(version.id)}/comments`, { node: 'Q1', text: '  ' })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', `${path(randomUUID())}/comments`, { node: 'Q1', text })).statusCode,
    ).toBe(404);
    const made = await call('POST', `${path(version.id)}/comments`, { node: 'Q1', text });
    expect(made.statusCode).toBe(201);
    const id = made.json<{ id: string }>().id;
    expect((await call('GET', `${path(version.id)}/comments`)).json()).toEqual([
      {
        id,
        node: 'Q1',
        text,
        version_no: 1,
        created_at: expect.any(String) as unknown,
        created_by: 'Syntetisk Admin',
        resolved_at: null,
        resolved_by: null,
      },
    ]);
    // Who and where are logged; what was written is not.
    const logged = await db.auditLog.findMany({ where: { who, what: 'surveys.comment' } });
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged)).not.toContain('enklare');
    await call('PUT', `/api/admin/surveys/comments/${id}`, { resolved: true });
    expect((await call('GET', `${path(version.id)}/comments`)).json()).toMatchObject([
      { id, resolved_at: expect.any(String) as unknown, resolved_by: 'Syntetisk Admin' },
    ]);
    await call('PUT', `/api/admin/surveys/comments/${id}`, { resolved: false });
    const draft = (
      await call('POST', `/api/admin/surveys/${template}/drafts`, { copy_from: version.id })
    ).json<Version>();
    expect((await call('GET', `${path(draft.id)}/comments`)).json()).toMatchObject([
      { id, node: 'Q1', version_no: 1, resolved_at: null },
    ]);
    expect(await db.auditLog.count({ where: { who, what: 'surveys.comment.resolve' } })).toBe(2);
  });

  it('a survey without the template metrics of the seeded surveys has nothing to keep', async () => {
    const r = await call('GET', `${path(version.id)}/metrics`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
    expect((await call('GET', `${path(version.id)}/metrics`, undefined, false)).statusCode).toBe(
      401,
    );
  });
});
