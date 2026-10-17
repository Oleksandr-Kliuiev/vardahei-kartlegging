// 2.16 (integration): «Innstillingar», new surveys from a title or a copy, one draft per survey, the
// library summary and what each language was approved on.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { emptyTexts } from '@varde/schema/template/respondent-texts';
import type { TemplateContent } from '@varde/schema/template/template';
import { issues } from '../../src/modules/surveys/editor-contract.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { editorContent } from '../support/editor-content.js';
import { startApp, type TestApp } from '../support/auth-app.js';

let t: TestApp, db: PrismaService, cookie: string;
let before: { value: Prisma.JsonValue; updated_by: string } | null = null;
const who = `test-library-${randomUUID()}`,
  run = randomUUID().slice(0, 8);
interface Version {
  id: string;
  template_id: string;
  label: string;
  content_hash: string;
  content: TemplateContent;
  translation_acceptance: Record<string, unknown>;
  acceptance_basis: Record<string, { by: string; texts: Record<string, Record<string, string>> }>;
  people: Record<string, string>;
}
const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { cookie: `varde_session=${encodeURIComponent(cookie)}` },
    });
const path = (id: string) => `/api/admin/surveys/versions/${id}`;
const defaults = {
  contact: {
    name: 'Syntetisk kontakt',
    phone: '00 00 00 00',
    email: 'kontakt@example.invalid',
    hours: { nn: 'Kvardagar 08–16', en: 'Weekdays 08–16' },
  },
  sender: { nn: 'Syntetisk avsendar', en: 'Synthetic sender' },
};
async function publish(id: string) {
  let v = (await call('GET', path(id))).json<Version>();
  for (const lang of v.content.required_languages)
    await call('POST', `${path(id)}/accept`, { content_hash: v.content_hash, lang });
  v = (await call('GET', path(id))).json<Version>();
  const r = await call('POST', `${path(id)}/publish`, {
    content_hash: v.content_hash,
    confirmed: true,
  });
  expect(r.statusCode).toBe(201);
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
  // Names come from the admin sessions in the database (the test app keeps its own in memory).
  await db.adminSession.create({
    data: {
      oid: who,
      name: 'Syntetisk Admin',
      via: 'entra',
      expires_at: new Date(Date.now() + 3600_000),
    },
  });
  before = await db.appSetting.findUnique({ where: { key: 'defaults' } });
});
afterAll(async () => {
  if (before)
    await db.appSetting.update({
      where: { key: 'defaults' },
      data: { value: before.value as Prisma.InputJsonValue, updated_by: before.updated_by },
    });
  else await db.appSetting.deleteMany({ where: { key: 'defaults' } });
  await db.auditLog.deleteMany({ where: { who } });
  await db.adminSession.deleteMany({ where: { oid: who } });
  await t.app.close();
});

describe('survey library, new surveys and settings (2.16)', () => {
  it('settings: empty fields are refused; saved defaults are audited and read back', async () => {
    const empty = { ...defaults, contact: { ...defaults.contact, name: ' ' } };
    expect((await call('PUT', '/api/admin/settings', empty)).statusCode).toBe(400);
    expect((await call('PUT', '/api/admin/settings', defaults)).statusCode).toBe(200);
    expect((await call('GET', '/api/admin/settings')).json()).toEqual({ ...defaults, saved: true });
    expect(
      await db.auditLog.count({
        where: { who, what: 'settings.update', target: 'app_setting:defaults' },
      }),
    ).toBe(1);
  });

  it('a survey made from its title gets a free key and the defaults; only its first question is left', async () => {
    const title = `Etter seminaret ${run}`;
    const body = {
      title,
      audience: 'client_survey',
      identification: 'initials',
      required_languages: ['nn', 'en'],
    };
    const first = (await call('POST', '/api/admin/surveys', body)).json<Version>();
    const second = (await call('POST', '/api/admin/surveys', body)).json<Version>();
    expect(first.content.key).toBe(`etter-seminaret-${run}`);
    expect(second.content.key).toBe(`etter-seminaret-${run}-2`);
    const c = first.content;
    expect(c.intro.title).toEqual({ nn: title, en: '' });
    expect(c.intro.contact).toEqual(defaults.contact);
    expect(c.questions.map((q) => [q.id, !!q.identifier, !!q.role])).toEqual([
      ['Q1', true, false],
      ['Q2', false, true],
      ['Q3', false, false],
    ]);
    expect(issues(c)).toEqual([]);
    expect(emptyTexts(c).map((x) => x.key)).toEqual([
      'q.Q3.text',
      'q.Q3.option.a1',
      'q.Q3.option.a2',
    ]);
    // It saves as it is: the workshop's autosave works from the first change.
    const saved = await call('PUT', path(first.id), {
      content_hash: first.content_hash,
      content: c,
    });
    expect(saved.statusCode).toBe(200);
  });

  it('a copy takes the published content under a new title; one draft per survey, its name optional', async () => {
    const key = `test_${randomUUID().replaceAll('-', '')}`;
    const made = (
      await call('POST', '/api/admin/surveys', {
        key,
        audience: 'client_survey',
        identification: 'none',
        required_languages: ['nn', 'en'],
      })
    ).json<Version>();
    const saved = (
      await call('PUT', path(made.id), {
        content_hash: made.content_hash,
        content: editorContent(key),
      })
    ).json<Version>();
    await publish(saved.id);
    const copy = (
      await call('POST', '/api/admin/surveys', {
        title: `Kopi ${run}`,
        audience: 'seminar_live',
        identification: 'initials',
        required_languages: ['nn'],
        copy_from: saved.id,
      })
    ).json<Version>();
    expect(copy.content).toEqual({
      ...editorContent(copy.content.key),
      intro: { ...editorContent(key).intro, title: { nn: `Kopi ${run}`, en: 'Syntetisk skjema' } },
    });
    const draft = await call('POST', `/api/admin/surveys/${saved.template_id}/drafts`, {
      copy_from: saved.id,
    });
    expect(draft.statusCode).toBe(201);
    expect(draft.json<Version>().label).toBe('v2');
    const again = await call('POST', `/api/admin/surveys/${saved.template_id}/drafts`, {
      copy_from: saved.id,
    });
    expect(again.statusCode).toBe(409);
    expect(again.json<{ message: string }>().message).toBe(
      'Det finst alt eit utkast (v2). Opne det i staden.',
    );
    // The library: the title, questions, rounds and what is left in the draft.
    const list = (await call('GET', '/api/admin/surveys')).json<
      {
        key: string;
        title: string;
        question_count: number;
        rounds: number;
        draft: { version_no: number; left: number } | null;
        versions: { status: string; published_by: string | null }[];
      }[]
    >();
    const row = list.find((x) => x.key === key)!;
    expect(row).toMatchObject({ title: 'Syntetisk skjema', rounds: 0, draft: { version_no: 2 } });
    expect(row.question_count).toBe(editorContent(key).questions.length);
    expect(row.draft!.left).toBe(2); // nn and en are not approved in the new draft yet
    expect(row.versions.find((v) => v.status === 'published')!.published_by).toBe(
      'Syntetisk Admin',
    );
  });

  it('what a language was approved on survives saves; the approval itself does not', async () => {
    const key = `test_${randomUUID().replaceAll('-', '')}`;
    const made = (
      await call('POST', '/api/admin/surveys', {
        key,
        audience: 'client_survey',
        identification: 'none',
        required_languages: ['nn', 'en'],
      })
    ).json<Version>();
    let v = (
      await call('PUT', path(made.id), {
        content_hash: made.content_hash,
        content: editorContent(key),
      })
    ).json<Version>();
    await call('POST', `${path(v.id)}/accept`, { content_hash: v.content_hash, lang: 'en' });
    v = (await call('GET', path(v.id))).json<Version>();
    expect(v.acceptance_basis.en!.by).toBe(who);
    expect(v.people[who]).toBe('Syntetisk Admin');
    expect(v.acceptance_basis.en!.texts['intro.title']).toEqual({
      nn: 'Syntetisk skjema',
      en: 'Syntetisk skjema',
    });
    const changed = structuredClone(v.content);
    changed.intro.title.en = 'Synthetic survey';
    v = (
      await call('PUT', path(v.id), { content_hash: v.content_hash, content: changed })
    ).json<Version>();
    expect(v.translation_acceptance).toEqual({});
    expect(v.acceptance_basis.en!.texts['intro.title']!.en).toBe('Syntetisk skjema');
  });
});
