import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { CodesService } from '../../src/modules/rounds/codes.js';
import type { TemplateContent } from '@varde/schema/template/template';
import { editorContent } from '../support/editor-content.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { startApp, type TestApp } from '../support/auth-app.js';
import { contentHash } from '../../src/modules/surveys/hashes.js';
import { withPg } from '../support/rounds.js';
import { editorMetricPrefix } from '../../src/modules/surveys/editor-metrics.js';

let t: TestApp, db: PrismaService, cookie: string;
const who = `test-editor-${randomUUID()}`,
  rounds: string[] = [],
  clients: string[] = [];
const key = `test_${randomUUID().replaceAll('-', '')}`;
const input = {
  key,
  audience: 'client_survey',
  identification: 'none',
  required_languages: ['nn', 'en'],
};
const content = () => editorContent(key);
interface Version {
  id: string;
  template_id: string;
  content_hash: string;
  content: TemplateContent;
  status: string;
  version_no: number;
}
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
  auth = true,
) =>
  t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: auth ? { cookie: `varde_session=${encodeURIComponent(cookie)}` } : {},
    });
const path = (id: string) => `/api/admin/surveys/versions/${id}`;
let version: Version, open: Version;
beforeAll(async () => {
  t = await startApp({ PUBLIC_URL: 'https://example.invalid' });
  db = t.app.get(PrismaService);
  const session = await t.store.create({
    oid: who,
    name: who,
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  cookie = t.app.getHttpAdapter().getInstance().signCookie(session.sid);
});
afterAll(async () => {
  for (const id of rounds) {
    await withPg((pg) =>
      pg.query(
        'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = $1)',
        [id],
      ),
    );
    await db.revokedRoundCode.deleteMany({ where: { round_client: { round_id: id } } });
    await db.roundClient.deleteMany({ where: { round_id: id } });
    await db.round.delete({ where: { id } });
  }
  await db.client.deleteMany({ where: { id: { in: clients } } });
  await db.auditLog.deleteMany({ where: { who } });
  await t.app.close();
});
describe('admin survey editor and launch (1d)', () => {
  it('guards every new endpoint', async () => {
    const id = randomUUID();
    for (const [method, url] of [
      ['GET', '/api/admin/surveys'],
      ['POST', '/api/admin/surveys'],
      ['POST', `/api/admin/surveys/${id}/drafts`],
      ['GET', path(id)],
      ['PUT', path(id)],
      ['POST', '/api/admin/surveys/validate'],
      ['GET', `${path(id)}/preview`],
      ['POST', `${path(id)}/accept`],
      ['POST', `${path(id)}/publish`],
      ['POST', '/api/admin/clients'],
      ['PUT', `/api/admin/clients/${id}`],
      ['POST', '/api/admin/rounds/launch'],
    ] as const)
      expect((await call(method, url, {}, false)).statusCode, url).toBe(401);
  });
  it('creates a template with an empty draft and audits it; duplicate keys and invalid languages fail', async () => {
    expect(
      (await call('POST', '/api/admin/surveys', { ...input, required_languages: ['nn'] }))
        .statusCode,
    ).toBe(400);
    const result = await call('POST', '/api/admin/surveys', input);
    expect(result.statusCode).toBe(201);
    version = result.json<Version>();
    expect(version).toMatchObject({ status: 'draft', version_no: 1 });
    // Decision 5: a new survey has its role question (anonymous here, so no initials question).
    expect(version.content.questions.map((q) => [q.id, !!q.role, !!q.identifier])).toEqual([
      ['Q1', true, false],
    ]);
    expect(version.content.questions[0]!.texts.section_title).toEqual({
      nn: 'Om deg',
      en: 'About you',
    });
    expect((await call('POST', '/api/admin/surveys', input)).statusCode).toBe(409);
    expect(
      await db.auditLog.count({
        where: { who, what: 'surveys.create', target: `template_version:${version.id}` },
      }),
    ).toBe(1);
    expect((await call('GET', `${path(version.id)}/preview`)).statusCode).toBe(400);
  });
  it('returns field paths from the shared validator, rejects invalid saves without an audit write', async () => {
    const c = content();
    c.questions[1]!.visible_if = { '==': [{ var: 'missing' }, 'ja'] };
    const result = await call('PUT', path(version.id), {
      content_hash: version.content_hash,
      content: c,
    });
    expect(result.statusCode).toBe(400);
    expect(
      result
        .json<{ issues: { path: unknown[] }[] }>()
        .issues.some((i) => i.path.includes('visible_if')),
    ).toBe(true);
    expect(await db.auditLog.count({ where: { who, what: 'surveys.save' } })).toBe(0);
    const validation = await call('POST', '/api/admin/surveys/validate', c);
    const found = validation.json<{ issues: { blocking: boolean }[] }>().issues;
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((i) => i.blocking)).toBe(true);
  });
  it('saves valid content, rejects key/audience changes and lost updates', async () => {
    const result = await call('PUT', path(version.id), {
      content_hash: version.content_hash,
      content: content(),
    });
    expect(result.statusCode).toBe(200);
    const saved = result.json<Version>();
    expect(
      (
        await call('PUT', path(version.id), {
          content_hash: version.content_hash,
          content: content(),
        })
      ).statusCode,
    ).toBe(409);
    version = saved;
    expect(
      (
        await call('PUT', path(version.id), {
          content_hash: version.content_hash,
          content: { ...content(), key: 'other' },
        })
      ).statusCode,
    ).toBe(400);
    const a = content(),
      b = content();
    a.intro.title.nn = 'A';
    b.intro.title.nn = 'B';
    const results = await Promise.all(
      [a, b].map((c) =>
        call('PUT', path(version.id), { content_hash: version.content_hash, content: c }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    version = (await call('GET', path(version.id))).json<Version>();
    expect(version.content_hash).toBe(contentHash(version.content));
  });
  it('saves and previews an unfinished draft, never a broken reference; accept still needs a complete version', async () => {
    const c = content();
    delete c.questions[1]!.texts.text.en;
    c.questions[0]!.role = undefined;
    const validation = await call('POST', '/api/admin/surveys/validate', c);
    const found = validation.json<{ issues: { message: string; blocking: boolean }[] }>().issues;
    expect(found.map((i) => i.message).sort()).toEqual(['exactly one role question', 'missing en']);
    expect(found.every((i) => !i.blocking)).toBe(true);
    const saved = await call('PUT', path(version.id), {
      content_hash: version.content_hash,
      content: c,
    });
    expect(saved.statusCode).toBe(200);
    version = saved.json<Version>();
    expect((await call('GET', `${path(version.id)}/preview`)).statusCode).toBe(200);
    expect(
      (
        await call('POST', `${path(version.id)}/accept`, {
          content_hash: version.content_hash,
          lang: 'nn',
        })
      ).statusCode,
    ).toBe(400);
    const broken = structuredClone(c);
    broken.questions[1]!.visible_if = { '==': [{ var: 'missing' }, 'ja'] };
    const rejected = await call('PUT', path(version.id), {
      content_hash: version.content_hash,
      content: broken,
    });
    expect(rejected.statusCode).toBe(400);
    expect(
      rejected.json<{ issues: { blocking: boolean }[] }>().issues.every((i) => i.blocking),
    ).toBe(true);
    const shapeless = structuredClone(c) as unknown as { intro: { contact: { name: string } } };
    shapeless.intro.contact.name = '';
    expect(
      (
        await call('PUT', path(version.id), {
          content_hash: version.content_hash,
          content: shapeless,
        })
      ).statusCode,
    ).toBe(400);
    version = (
      await call('PUT', path(version.id), {
        content_hash: version.content_hash,
        content: content(),
      })
    ).json<Version>();
    expect(version.content).toEqual(content());
  });
  it('translation acceptances serialize and changed content clears every acceptance', async () => {
    const responses = await Promise.all(
      ['nn', 'en'].map((lang) =>
        call('POST', `${path(version.id)}/accept`, { content_hash: version.content_hash, lang }),
      ),
    );
    expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(
      (await db.templateVersion.findUniqueOrThrow({ where: { id: version.id } }))
        .translation_acceptance,
    ).toHaveProperty('nn');
    const c = version.content;
    c.questions[0]!.texts.text.en = 'Changed';
    version = (
      await call('PUT', path(version.id), { content_hash: version.content_hash, content: c })
    ).json<Version>();
    expect(
      (
        await call('POST', `${path(version.id)}/publish`, {
          content_hash: version.content_hash,
          confirmed: true,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', `${path(version.id)}/accept`, {
          content_hash: version.content_hash,
          lang: 'nb',
        })
      ).statusCode,
    ).toBe(400);
  });
  it('publish and save race safely; published content is immutable and metrics commit with publication', async () => {
    for (const lang of ['nn', 'en'])
      await call('POST', `${path(version.id)}/accept`, {
        content_hash: version.content_hash,
        lang,
      });
    const changed = structuredClone(version.content);
    changed.intro.title.nn += ' Endra';
    const [published, save] = await Promise.all([
      call('POST', `${path(version.id)}/publish`, {
        content_hash: version.content_hash,
        confirmed: true,
      }),
      call('PUT', path(version.id), { content_hash: version.content_hash, content: changed }),
    ]);
    if (save.statusCode === 200) {
      expect(published.statusCode).toBe(409);
      version = save.json<Version>();
      for (const lang of ['nn', 'en'])
        await call('POST', `${path(version.id)}/accept`, {
          content_hash: version.content_hash,
          lang,
        });
      expect(
        (
          await call('POST', `${path(version.id)}/publish`, {
            content_hash: version.content_hash,
            confirmed: true,
          })
        ).statusCode,
      ).toBe(201);
    } else {
      expect(save.statusCode).toBe(409);
      expect(published.statusCode).toBe(201);
    }
    expect(
      (
        await call('PUT', path(version.id), {
          content_hash: version.content_hash,
          content: version.content,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call('POST', `${path(version.id)}/accept`, {
          content_hash: version.content_hash,
          lang: 'nn',
        })
      ).statusCode,
    ).toBe(409);
    expect((await call('GET', `${path(version.id)}/preview`)).statusCode).toBe(200);
    await expect(
      db.templateVersion.update({ where: { id: version.id }, data: { label: 'illegal' } }),
    ).rejects.toThrow();
    const defs = await db.metricDefinition.findMany({
      where: { key: { startsWith: editorMetricPrefix(version.id) } },
    });
    expect(defs).toHaveLength(3);
    expect(defs.some((d) => JSON.stringify(d.definition).includes('S.rad'))).toBe(true);
    expect(
      defs.find((d) => JSON.stringify(d.definition).includes('leaders_all'))?.definition,
    ).toMatchObject({ populations: ['leaders_all'], part: 'leader' });
    expect(
      await db.auditLog.count({
        where: { who, what: 'surveys.publish', target: `template_version:${version.id}` },
      }),
    ).toBe(1);
  });
  it('concurrent copies: one draft per survey wins, the other is told to open it', async () => {
    const responses = await Promise.all(
      ['copy-a', 'copy-b'].map((label) =>
        call('POST', `/api/admin/surveys/${version.template_id}/drafts`, {
          label,
          copy_from: version.id,
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const made = responses.find((r) => r.statusCode === 201)!.json<Version>();
    expect(made.version_no).toBe(2);
    expect(made.content).toEqual((await call('GET', path(version.id))).json<Version>().content);
    open = made;
    expect(
      (await call('POST', `/api/admin/surveys/${version.template_id}/drafts`, { label: 'copy-c' }))
        .statusCode,
    ).toBe(409);
  });
  it('HTTP publication requires explicit frozen-change marks and audits the accepted mark', async () => {
    const draft = open;
    draft.content.questions[0]!.texts.text.nn += '?';
    const saved = await call('PUT', path(draft.id), {
      content_hash: draft.content_hash,
      content: draft.content,
    });
    const next = saved.json<Version>();
    expect(saved.statusCode).toBe(200);
    for (const lang of ['nn', 'en'])
      await call('POST', `${path(draft.id)}/accept`, { content_hash: next.content_hash, lang });
    const body = { content_hash: next.content_hash, confirmed: true };
    expect((await call('POST', `${path(draft.id)}/publish`, body)).statusCode).toBe(400);
    expect(
      (
        await call('POST', `${path(draft.id)}/publish`, {
          ...body,
          frozen_changes: { R: 'orthographic' },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      await db.auditLog.findFirstOrThrow({
        where: { who, what: 'surveys.frozen_change', target: `template_version:${draft.id}` },
      }),
    ).toMatchObject({ details: { question: 'R', kind: 'orthographic' } });
  });
  it('creates and updates clients through audited services and validates counts', async () => {
    const c = await call('POST', '/api/admin/clients', {
      name: 'Syntetisk kunde',
      employee_count: 12,
    });
    expect(c.statusCode).toBe(201);
    const id = c.json<{ id: string }>().id;
    clients.push(id);
    expect(
      (
        await call('PUT', `/api/admin/clients/${id}`, {
          name: 'Syntetisk kunde endra',
          employee_count: 24,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('PUT', `/api/admin/clients/${id}`, { name: '', employee_count: -1 })).statusCode,
    ).toBe(400);
    expect(await db.auditLog.count({ where: { who, target: `client:${id}` } })).toBe(2);
  });
  it('launch rolls back round, clients, codes and audit when any selected client is invalid', async () => {
    const count = await db.auditLog.count({ where: { who } });
    const request = {
      name: who,
      template_version_id: version.id,
      open: true,
      clients: [
        { client_id: clients[0], deadline: '2099-01-01' },
        { client_id: randomUUID(), deadline: '2099-01-01' },
      ],
    };
    expect((await call('POST', '/api/admin/rounds/launch', request)).statusCode).toBe(404);
    expect(await db.round.count({ where: { name: who } })).toBe(0);
    expect(await db.auditLog.count({ where: { who } })).toBe(count);
    expect(
      (
        await call('POST', '/api/admin/rounds/launch', {
          ...request,
          clients: [request.clients[0], request.clients[0]],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', '/api/admin/rounds/launch', {
          ...request,
          clients: [{ client_id: clients[0], deadline: '2000-01-01' }],
        })
      ).statusCode,
    ).toBe(400);
  });
  it('a late code-issuance failure rolls back already issued codes, clients, round and audit', async () => {
    const second = (
      await call('POST', '/api/admin/clients', {
        name: 'Syntetisk andre kunde',
        employee_count: 10,
      })
    ).json<{ id: string }>().id;
    clients.push(second);
    const count = await db.auditLog.count({ where: { who } });
    const codes = t.app.get(CodesService),
      issue = codes.issue.bind(codes);
    const spy = vi
      .spyOn(codes, 'issue')
      .mockImplementationOnce(issue)
      .mockRejectedValueOnce(new ServiceUnavailableException('Syntetisk feil.'));
    try {
      const result = await call('POST', '/api/admin/rounds/launch', {
        name: who,
        template_version_id: version.id,
        open: true,
        clients: [clients[0], second].map((client_id) => ({ client_id, deadline: '2099-01-01' })),
      });
      expect(result.statusCode).toBe(503);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(await db.round.count({ where: { name: who } })).toBe(0);
      expect(await db.auditLog.count({ where: { who } })).toBe(count);
      expect(await db.roundClient.count({ where: { client_id: second } })).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
  it('launch uses client defaults, returns no bearer, retrieves invitations and selects only own version metrics', async () => {
    const result = await call('POST', '/api/admin/rounds/launch', {
      name: who,
      template_version_id: version.id,
      open: true,
      clients: [{ client_id: clients[0], deadline: '2099-01-01' }],
    });
    expect(result.statusCode).toBe(201);
    const r = result.json<{ id: string; round_client_ids: string[] }>();
    rounds.push(r.id);
    expect(result.body).not.toMatch(/code|hash|answers/);
    const rc = await db.roundClient.findUniqueOrThrow({ where: { id: r.round_client_ids[0] } });
    expect(rc).toMatchObject({ status: 'open', population_snapshot: 24 });
    const invite = await call('GET', `/api/admin/round-clients/${rc.id}/invitation`);
    expect(invite.statusCode).toBe(200);
    expect(invite.json<{ link: string }>().link).toContain('/r?c=');
    expect(JSON.stringify(await db.auditLog.findMany({ where: { who } }))).not.toContain(rc.code);
    const defs = await t.app.get(MetricsService).definitionsFor(r.id);
    expect(defs).toHaveLength(3);
    expect(defs.every((d) => d.key.startsWith(editorMetricPrefix(version.id)))).toBe(true);
    const draft = await call('POST', '/api/admin/rounds/launch', {
      name: who,
      template_version_id: version.id,
      open: false,
      clients: [{ client_id: clients[0], deadline: '2099-01-01', population_snapshot: null }],
    });
    expect(draft.statusCode).toBe(201);
    rounds.push(draft.json<{ id: string }>().id);
    expect(await db.roundClient.findFirstOrThrow({ where: { round_id: rounds[1] } })).toMatchObject(
      { status: 'draft', code: null, population_snapshot: null },
    );
  });
  it('new distributions run through privacy: two respondents stay hidden, three show and release freezes the result', async () => {
    const roundId = rounds[0]!;
    const rc = await db.roundClient.findFirstOrThrow({ where: { round_id: roundId } });
    const send = () =>
      t.app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/runner/submissions',
          headers: { authorization: `Bearer ${rc.code}` },
          payload: {
            submission_id: randomUUID(),
            part: 'common',
            lang: 'nn',
            answers: { R: 'test', S: { rad: 1 } },
            duration_s: 120,
          },
        });
    for (let i = 0; i < 2; i++) expect((await send()).statusCode).toBe(201);
    interface Dashboard {
      source: string;
      questions: {
        id: string;
        series: { buckets: { cell: { suppressed: boolean; numerator?: number } }[] }[];
      }[];
    }
    const dashboard = async () => {
      const result = await call('GET', `/api/admin/dashboard?round=${roundId}`);
      expect(result.statusCode).toBe(200);
      return result.json<Dashboard>();
    };
    const small = await dashboard();
    expect(
      small.questions.find((q) => q.id === 'S')!.series[0]!.buckets.every((b) => b.cell.suppressed),
    ).toBe(true);
    expect((await send()).statusCode).toBe(201);
    const visible = await dashboard();
    expect(visible.questions.find((q) => q.id === 'R')!.series[0]!.buckets[0]!.cell).toMatchObject({
      suppressed: false,
      numerator: 3,
    });
    expect((await call('POST', `/api/admin/rounds/${roundId}/close`)).statusCode).toBe(201);
    const released = await dashboard();
    expect(released.source).toBe('released');
    expect(released.questions).toMatchObject(visible.questions);
  });
  it('trash: a deleted draft hides, restores, or is removed for good; a lone draft takes its survey along', async () => {
    const lone = (
      await call('POST', '/api/admin/surveys', { ...input, key: `${key}_lone` })
    ).json<Version>();
    expect(
      (await call('DELETE', path(lone.id), { content_hash: contentHash({ stale: true }) }))
        .statusCode,
    ).toBe(409);
    const gone = await call('DELETE', path(lone.id), { content_hash: lone.content_hash });
    expect(gone.json()).toMatchObject({ survey_removed: true });
    expect((await call('GET', path(lone.id))).statusCode).toBe(404);
    const listed = (await call('GET', '/api/admin/surveys')).json<{ id: string }[]>();
    expect(listed.some((t) => t.id === lone.template_id)).toBe(false);
    const trash = (await call('GET', '/api/admin/surveys/trash')).json<
      { id: string; can_restore: boolean; deleted_by: string | null }[]
    >();
    expect(trash.find((r) => r.id === lone.id)).toMatchObject({ can_restore: true });
    // Restore: the survey and its draft are back and can be saved again.
    expect((await call('POST', `${path(lone.id)}/restore`)).statusCode).toBe(201);
    expect((await call('GET', path(lone.id))).statusCode).toBe(200);
    expect((await call('POST', `${path(lone.id)}/restore`)).statusCode).toBe(404);
    // Purge only works from the trash, and takes the empty survey with it.
    expect((await call('DELETE', `/api/admin/surveys/trash/${lone.id}`)).statusCode).toBe(404);
    await call('DELETE', path(lone.id), { content_hash: lone.content_hash });
    expect((await call('DELETE', `/api/admin/surveys/trash/${lone.id}`)).json()).toMatchObject({
      survey_removed: true,
    });
    expect(await db.surveyTemplate.count({ where: { id: lone.template_id } })).toBe(0);
    // A survey with published versions keeps them; restoring is refused while another draft is open.
    const next = (
      await call('POST', `/api/admin/surveys/${version.template_id}/drafts`, { label: 'to-trash' })
    ).json<Version>();
    const kept = await call('DELETE', path(next.id), { content_hash: next.content_hash });
    expect(kept.json()).toMatchObject({ survey_removed: false });
    const after = (await call('GET', '/api/admin/surveys')).json<
      { id: string; draft: unknown; versions: { id: string }[] }[]
    >();
    const mine = after.find((t) => t.id === version.template_id)!;
    expect(mine.draft).toBeNull();
    expect(mine.versions.some((v) => v.id === next.id)).toBe(false);
    expect((await call('GET', path(version.id))).statusCode).toBe(200);
    const again = (
      await call('POST', `/api/admin/surveys/${version.template_id}/drafts`, { label: 'second' })
    ).json<Version>();
    expect(again.version_no).toBeGreaterThan(next.version_no);
    expect((await call('POST', `${path(next.id)}/restore`)).statusCode).toBe(409);
    expect(
      (await call('GET', '/api/admin/surveys/trash'))
        .json<{ id: string; can_restore: boolean }[]>()
        .find((r) => r.id === next.id),
    ).toMatchObject({ can_restore: false });
    await call('DELETE', path(again.id), { content_hash: again.content_hash });
    expect((await call('POST', `${path(next.id)}/restore`)).statusCode).toBe(201);
    expect(
      (await call('DELETE', path(version.id), { content_hash: version.content_hash })).statusCode,
    ).toBe(409);
    // Cleanup for the suite's afterAll: nothing of ours stays in the trash.
    await call('DELETE', path(next.id), { content_hash: next.content_hash });
    await call('DELETE', `/api/admin/surveys/trash/${next.id}`);
    await call('DELETE', `/api/admin/surveys/trash/${again.id}`);
  });
});
